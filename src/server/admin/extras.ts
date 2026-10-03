import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { localized } from "@/lib/localized";
import { extraSchema } from "@/lib/validation/catalog";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { violatedConstraint } from "@/server/db-errors";

function assertId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Udstyret findes ikke");
}

const LANGUAGES = ["da", "en", "ar", "fr"] as const;

/** Ekstraudstyr med antal bookinger, det har været på (F8). */
export async function listExtras(ctx: PolicyContext) {
  assertCan(ctx, "catalog:write");
  const extras = await db.extra.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      nameI18n: true,
      pricing: true,
      priceMinor: true,
      maxPriceMinor: true,
      currency: true,
      maxQuantity: true,
      stock: true,
      isActive: true,
      _count: { select: { bookingItems: true } },
    },
  });
  return extras.map(({ nameI18n, _count, ...extra }) => ({
    ...extra,
    name: localized(nameI18n, "da"),
    used: _count.bookingItems,
  }));
}

/** Ét stykke udstyr til formularen. Tekster pr. sprog pakkes ud til felterne. */
export async function adminExtra(ctx: PolicyContext, extraId: string) {
  assertCan(ctx, "catalog:write");
  assertId(extraId);
  const extra = await db.extra.findUnique({
    where: { id: extraId },
    include: { _count: { select: { bookingItems: true } } },
  });
  if (!extra) throw new AppError("NOT_FOUND", "Udstyret findes ikke");
  const names = (extra.nameI18n ?? {}) as Record<string, string | undefined>;
  const descriptions = (extra.descriptionI18n ?? {}) as Record<string, string | undefined>;
  return {
    ...extra,
    used: extra._count.bookingItems,
    names: Object.fromEntries(LANGUAGES.map((lang) => [lang, names[lang] ?? ""])),
    descriptions: Object.fromEntries(LANGUAGES.map((lang) => [lang, descriptions[lang] ?? ""])),
  } as typeof extra & {
    used: number;
    names: Record<(typeof LANGUAGES)[number], string>;
    descriptions: Record<(typeof LANGUAGES)[number], string>;
  };
}

function extraData(values: ReturnType<typeof extraSchema.parse>) {
  const texts = (entries: [string, string | null][]) =>
    Object.fromEntries(entries.filter(([, text]) => text));
  const descriptions = texts([
    ["da", values.descriptionDa],
    ["en", values.descriptionEn],
    ["ar", values.descriptionAr],
    ["fr", values.descriptionFr],
  ]);
  return {
    code: values.code,
    nameI18n: texts([
      ["da", values.nameDa],
      ["en", values.nameEn],
      ["ar", values.nameAr],
      ["fr", values.nameFr],
    ]),
    descriptionI18n: Object.keys(descriptions).length > 0 ? descriptions : undefined,
    pricing: values.pricing,
    priceMinor: values.price,
    maxPriceMinor: values.pricing === "PER_DAY" ? values.maxPrice : null,
    maxQuantity: values.maxQuantity,
    stock: values.stock,
    sortOrder: values.sortOrder,
    isActive: values.isActive,
  };
}

function duplicateCode(error: unknown): never {
  if (violatedConstraint(error) === "Extra_code_key") {
    throw new AppError("VALIDATION_FAILED", "Koden bruges allerede", {
      fields: ["code"],
      reason: "DUPLICATE",
    });
  }
  throw error;
}

/** Nyt udstyr (MANAGER+). Vises i bookingflowet, når det er aktivt. */
export async function createExtra(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "catalog:write");
  const data = extraData(parseInput(extraSchema, input));
  try {
    return await db.$transaction(async (tx) => {
      const extra = await tx.extra.create({ data, select: { id: true } });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "extra.create",
        entityType: "Extra",
        entityId: extra.id,
        diff: { code: data.code, priceMinor: data.priceMinor, pricing: data.pricing },
      });
      return extra;
    });
  } catch (error) {
    duplicateCode(error);
  }
}

/**
 * Ret udstyr (MANAGER+). Nye priser og navne gælder kun nye bookinger; bookinger har deres egen
 * kopi af navn og pris (BookingItem).
 */
export async function updateExtra(
  ctx: PolicyContext,
  extraId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "catalog:write");
  assertId(extraId);
  const data = extraData(parseInput(extraSchema, input));
  const existing = await db.extra.count({ where: { id: extraId } });
  if (!existing) throw new AppError("NOT_FOUND", "Udstyret findes ikke");
  try {
    return await db.$transaction(async (tx) => {
      await tx.extra.update({
        where: { id: extraId },
        data: { ...data, descriptionI18n: data.descriptionI18n ?? {} },
      });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "extra.update",
        entityType: "Extra",
        entityId: extraId,
        diff: {
          code: data.code,
          priceMinor: data.priceMinor,
          pricing: data.pricing,
          isActive: data.isActive,
        },
      });
      return { id: extraId };
    });
  } catch (error) {
    duplicateCode(error);
  }
}

/** Slet udstyr, der aldrig har været booket. Ellers deaktiveres det (F8). */
export async function deleteExtra(ctx: PolicyContext, extraId: string) {
  assertCan(ctx, "catalog:write");
  assertId(extraId);
  return db.$transaction(async (tx) => {
    const extra = await tx.extra.findUnique({
      where: { id: extraId },
      select: { code: true, _count: { select: { bookingItems: true } } },
    });
    if (!extra) throw new AppError("NOT_FOUND", "Udstyret findes ikke");
    if (extra._count.bookingItems > 0) {
      throw new AppError("CONFLICT", "Udstyret er brugt i bookinger", { reason: "IN_USE" });
    }
    await tx.extra.delete({ where: { id: extraId } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "extra.delete",
      entityType: "Extra",
      entityId: extraId,
      diff: { code: extra.code },
    });
  });
}
