import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { localized } from "@/lib/localized";
import { pricePreviewSchema, pricingRuleSchema } from "@/lib/validation/catalog";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { applicableTiers, rentalPrice } from "@/server/pricing/ladder";
import type { PriceRule } from "@/server/pricing/types";

function dateKey(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function assertId(id: string, message: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", message);
}

const ruleSelect = {
  id: true,
  categoryId: true,
  carModelId: true,
  minDays: true,
  packageMinor: true,
  perDayMinor: true,
  currency: true,
  validFrom: true,
  validTo: true,
  priority: true,
} as const;

/**
 * Prissiden (F8): kategorier, den valgte kategoris regler og modeller. Reglerne sorteres som
 * pristrappen læses: først kategoriens standardpriser, så sæsoner, så modelpriser.
 */
export async function pricingOverview(ctx: PolicyContext, categoryId?: string | null) {
  assertCan(ctx, "catalog:write");
  const categories = await db.carCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameI18n: true, _count: { select: { pricingRules: true } } },
  });
  const selected =
    categories.find((category) => category.id === categoryId) ?? categories[0] ?? null;
  if (!selected) return { categories: [], category: null, rules: [], models: [], warnings: [] };

  const [rules, models] = await Promise.all([
    db.pricingRule.findMany({
      where: { categoryId: selected.id },
      orderBy: [
        { carModelId: { sort: "asc", nulls: "first" } },
        { validFrom: { sort: "asc", nulls: "first" } },
        { minDays: "asc" },
      ],
      select: { ...ruleSelect, carModel: { select: { brand: true, model: true } } },
    }),
    db.carModel.findMany({
      where: { categoryId: selected.id },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      select: { id: true, brand: true, model: true, isActive: true },
    }),
  ]);

  // Uden en standardpris for 1 dag kan kunder ikke booke korte lejer i kategorien.
  const base = rules.filter((rule) => !rule.carModelId && !rule.validFrom && !rule.validTo);
  const warnings: ("noBase" | "noOneDay")[] = [];
  if (base.length === 0) warnings.push("noBase");
  else if (!base.some((rule) => rule.minDays === 1)) warnings.push("noOneDay");

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: localized(category.nameI18n, "da"),
      rules: category._count.pricingRules,
    })),
    category: { id: selected.id, name: localized(selected.nameI18n, "da") },
    rules: rules.map(({ carModel, ...rule }) => ({
      ...rule,
      validFrom: dateKey(rule.validFrom),
      validTo: dateKey(rule.validTo),
      model: carModel ? `${carModel.brand} ${carModel.model}` : null,
    })),
    models: models.map((model) => ({
      id: model.id,
      name: `${model.brand} ${model.model}`,
      isActive: model.isActive,
    })),
    warnings,
  };
}

export type PricingOverview = Awaited<ReturnType<typeof pricingOverview>>;

/** Én regel til redigering. */
export async function pricingRule(ctx: PolicyContext, ruleId: string) {
  assertCan(ctx, "catalog:write");
  assertId(ruleId, "Prisreglen findes ikke");
  const rule = await db.pricingRule.findUnique({
    where: { id: ruleId },
    select: { ...ruleSelect, category: { select: { nameI18n: true } } },
  });
  if (!rule) throw new AppError("NOT_FOUND", "Prisreglen findes ikke");
  const models = await db.carModel.findMany({
    where: { categoryId: rule.categoryId },
    orderBy: [{ brand: "asc" }, { model: "asc" }],
    select: { id: true, brand: true, model: true, isActive: true },
  });
  return {
    ...rule,
    validFrom: dateKey(rule.validFrom),
    validTo: dateKey(rule.validTo),
    category: localized(rule.category.nameI18n, "da"),
    models: models.map((model) => ({
      id: model.id,
      name: `${model.brand} ${model.model}`,
      isActive: model.isActive,
    })),
  };
}

async function ruleData(input: Record<string, unknown>) {
  const values = parseInput(pricingRuleSchema, input);
  const category = await db.carCategory.count({ where: { id: values.categoryId } });
  if (!category) {
    throw new AppError("VALIDATION_FAILED", "Kategorien findes ikke", { fields: ["categoryId"] });
  }
  if (values.carModelId) {
    const model = await db.carModel.count({
      where: { id: values.carModelId, categoryId: values.categoryId },
    });
    if (!model) {
      throw new AppError("VALIDATION_FAILED", "Modellen er ikke i kategorien", {
        fields: ["carModelId"],
      });
    }
  }
  return {
    categoryId: values.categoryId,
    carModelId: values.carModelId,
    minDays: values.minDays,
    packageMinor: values.packagePrice,
    perDayMinor: values.perDayPrice,
    validFrom: values.validFrom ? new Date(`${values.validFrom}T00:00:00Z`) : null,
    validTo: values.validTo ? new Date(`${values.validTo}T00:00:00Z`) : null,
    priority: values.priority,
  };
}

function auditDiff(data: Awaited<ReturnType<typeof ruleData>>) {
  return {
    carModelId: data.carModelId,
    minDays: data.minDays,
    packageMinor: data.packageMinor,
    perDayMinor: data.perDayMinor,
    validFrom: dateKey(data.validFrom),
    validTo: dateKey(data.validTo),
    priority: data.priority,
  };
}

/** Ny regel (MANAGER+). Gælder kun nye bookinger; eksisterende har deres pris i linjerne. */
export async function createPricingRule(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "catalog:write");
  const data = await ruleData(input);
  return db.$transaction(async (tx) => {
    const rule = await tx.pricingRule.create({ data, select: { id: true, categoryId: true } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "pricingRule.create",
      entityType: "PricingRule",
      entityId: rule.id,
      diff: auditDiff(data),
    });
    return rule;
  });
}

export async function updatePricingRule(
  ctx: PolicyContext,
  ruleId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "catalog:write");
  assertId(ruleId, "Prisreglen findes ikke");
  const existing = await db.pricingRule.findUnique({
    where: { id: ruleId },
    select: { categoryId: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Prisreglen findes ikke");
  // Kategorien ændres ikke her; en regel flyttes ved at slette og oprette.
  const data = await ruleData({ ...input, categoryId: existing.categoryId });
  return db.$transaction(async (tx) => {
    const rule = await tx.pricingRule.update({
      where: { id: ruleId },
      data,
      select: { id: true, categoryId: true },
    });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "pricingRule.update",
      entityType: "PricingRule",
      entityId: ruleId,
      diff: auditDiff(data),
    });
    return rule;
  });
}

/** Sletning er sikker: bookinger gemmer deres egne priser (BookingItem), ikke reglen. */
export async function deletePricingRule(ctx: PolicyContext, ruleId: string) {
  assertCan(ctx, "catalog:write");
  assertId(ruleId, "Prisreglen findes ikke");
  return db.$transaction(async (tx) => {
    const rule = await tx.pricingRule.findUnique({
      where: { id: ruleId },
      select: { categoryId: true, minDays: true, carModelId: true },
    });
    if (!rule) throw new AppError("NOT_FOUND", "Prisreglen findes ikke");
    await tx.pricingRule.delete({ where: { id: ruleId } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "pricingRule.delete",
      entityType: "PricingRule",
      entityId: ruleId,
      diff: { minDays: rule.minDays, carModelId: rule.carModelId },
    });
    return { categoryId: rule.categoryId };
  });
}

/**
 * "En kunde, der booker 5 dage, betaler X" (F8). Samme trappe som prismotoren bruger, så svaret
 * passer med kataloget. Ekstraudstyr, levering og rabatter er ikke med.
 */
export async function pricePreview(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "catalog:write");
  const values = parseInput(pricePreviewSchema, input);
  const model = await db.carModel.findUnique({
    where: { id: values.carModelId },
    select: { id: true, categoryId: true, currency: true },
  });
  if (!model)
    throw new AppError("VALIDATION_FAILED", "Modellen findes ikke", { fields: ["carModelId"] });
  const rules = await db.pricingRule.findMany({
    where: { categoryId: model.categoryId, OR: [{ carModelId: null }, { carModelId: model.id }] },
    select: ruleSelect,
  });
  const tiers = applicableTiers(
    rules.map((rule): PriceRule => ({
      ...rule,
      validFrom: dateKey(rule.validFrom),
      validTo: dateKey(rule.validTo),
    })),
    model.id,
    values.date,
  );
  const price = rentalPrice(tiers, values.days);
  return {
    days: values.days,
    date: values.date,
    currency: model.currency,
    price: price
      ? {
          totalMinor: price.totalMinor,
          ruleId: price.tier.id,
          minDays: price.tier.minDays,
          perDayMinor: price.tier.perDayMinor,
          isPackage: price.tier.minDays === values.days,
          cappedByNextPackage: price.cappedByNextPackage,
        }
      : null,
  };
}
