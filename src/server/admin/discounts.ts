import "server-only";
import { z } from "zod";
import { localDayBounds } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { localized } from "@/lib/localized";
import { discountSchema } from "@/lib/validation/catalog";
import { parseInput } from "@/lib/validation/parse";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { violatedConstraint } from "@/server/db-errors";

function assertId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Rabatkoden findes ikke");
}

/** Lokal dato "YYYY-MM-DD" i virksomhedens tidszone. */
function localKey(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ADMIN_TIME_ZONE }).format(date);
}

/** Rabatkoder med antal gange, de er brugt (F8). */
export async function listDiscounts(ctx: PolicyContext) {
  assertCan(ctx, "catalog:write");
  const discounts = await db.discount.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      currency: true,
      validFrom: true,
      validTo: true,
      maxUses: true,
      isActive: true,
      _count: { select: { redemptions: true, categories: true, carModels: true } },
    },
  });
  return discounts.map(({ _count, ...discount }) => ({
    ...discount,
    validFrom: localKey(discount.validFrom),
    validTo: localKey(discount.validTo),
    used: _count.redemptions,
    restricted: _count.categories + _count.carModels > 0,
  }));
}

/** Kategorier og modeller, en rabat kan begrænses til. */
export async function discountOptions(ctx: PolicyContext) {
  assertCan(ctx, "catalog:write");
  const categories = await db.carCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      nameI18n: true,
      models: {
        orderBy: [{ brand: "asc" }, { model: "asc" }],
        select: { id: true, brand: true, model: true },
      },
    },
  });
  return categories.map((category) => ({
    id: category.id,
    name: localized(category.nameI18n, "da"),
    models: category.models.map((model) => ({
      id: model.id,
      name: `${model.brand} ${model.model}`,
    })),
  }));
}

export async function adminDiscount(ctx: PolicyContext, discountId: string) {
  assertCan(ctx, "catalog:write");
  assertId(discountId);
  const discount = await db.discount.findUnique({
    where: { id: discountId },
    include: {
      categories: { select: { id: true } },
      carModels: { select: { id: true } },
      _count: { select: { redemptions: true, bookings: true } },
    },
  });
  if (!discount) throw new AppError("NOT_FOUND", "Rabatkoden findes ikke");
  const total = await db.discountRedemption.aggregate({
    where: { discountId },
    _sum: { amountMinor: true },
  });
  return {
    ...discount,
    validFrom: localKey(discount.validFrom),
    validTo: localKey(discount.validTo),
    categoryIds: discount.categories.map((category) => category.id),
    carModelIds: discount.carModels.map((model) => model.id),
    used: discount._count.redemptions,
    bookings: discount._count.bookings,
    givenMinor: total._sum.amountMinor ?? 0,
  };
}

async function discountData(input: Record<string, unknown>) {
  const values = parseInput(discountSchema, input);
  const [categories, models] = await Promise.all([
    db.carCategory.count({ where: { id: { in: values.categoryIds } } }),
    db.carModel.count({ where: { id: { in: values.carModelIds } } }),
  ]);
  if (categories !== values.categoryIds.length || models !== values.carModelIds.length) {
    throw new AppError("VALIDATION_FAILED", "Ukendt kategori eller model", {
      fields: ["categoryIds"],
    });
  }
  return {
    code: values.code,
    type: values.type,
    value: values.value,
    currency: values.type === "FIXED" ? "DKK" : null,
    // Hele dage i virksomhedens tidszone: fra dagens start til dagens slutning.
    validFrom: values.validFrom ? localDayBounds(values.validFrom, ADMIN_TIME_ZONE).start : null,
    validTo: values.validTo
      ? new Date(localDayBounds(values.validTo, ADMIN_TIME_ZONE).end.getTime() - 1)
      : null,
    minBookingMinor: values.minBooking,
    minDays: values.minDays,
    maxUses: values.maxUses,
    maxUsesPerCustomer: values.maxUsesPerCustomer,
    isActive: values.isActive,
    categoryIds: values.categoryIds,
    carModelIds: values.carModelIds,
  };
}

function duplicateCode(error: unknown): never {
  if (violatedConstraint(error) === "Discount_code_key") {
    throw new AppError("VALIDATION_FAILED", "Koden findes allerede", {
      fields: ["code"],
      reason: "DUPLICATE",
    });
  }
  throw error;
}

function auditDiff(data: Awaited<ReturnType<typeof discountData>>) {
  return {
    code: data.code,
    type: data.type,
    value: data.value,
    isActive: data.isActive,
    validFrom: data.validFrom?.toISOString() ?? null,
    validTo: data.validTo?.toISOString() ?? null,
    maxUses: data.maxUses,
  };
}

/** Ny rabatkode (MANAGER+). Koden gemmes med store bogstaver. */
export async function createDiscount(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "catalog:write");
  const { categoryIds, carModelIds, ...data } = await discountData(input);
  try {
    return await db.$transaction(async (tx) => {
      const discount = await tx.discount.create({
        data: {
          ...data,
          categories: { connect: categoryIds.map((id) => ({ id })) },
          carModels: { connect: carModelIds.map((id) => ({ id })) },
        },
        select: { id: true },
      });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "discount.create",
        entityType: "Discount",
        entityId: discount.id,
        diff: auditDiff({ ...data, categoryIds, carModelIds }),
      });
      return discount;
    });
  } catch (error) {
    duplicateCode(error);
  }
}

/**
 * Ret en rabatkode (MANAGER+). Bookinger, der allerede har fået rabatten, beholder den; ændringen
 * gælder kun nye bookinger. Koden kan ikke ændres, når den er brugt, så kvitteringer passer.
 */
export async function updateDiscount(
  ctx: PolicyContext,
  discountId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "catalog:write");
  assertId(discountId);
  const { categoryIds, carModelIds, ...data } = await discountData(input);
  const existing = await db.discount.findUnique({
    where: { id: discountId },
    select: { code: true, _count: { select: { bookings: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Rabatkoden findes ikke");
  if (existing.code !== data.code && existing._count.bookings > 0) {
    throw new AppError("VALIDATION_FAILED", "Koden er brugt", {
      fields: ["code"],
      reason: "IN_USE",
    });
  }
  try {
    return await db.$transaction(async (tx) => {
      await tx.discount.update({
        where: { id: discountId },
        data: {
          ...data,
          categories: { set: categoryIds.map((id) => ({ id })) },
          carModels: { set: carModelIds.map((id) => ({ id })) },
        },
      });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "discount.update",
        entityType: "Discount",
        entityId: discountId,
        diff: auditDiff({ ...data, categoryIds, carModelIds }),
      });
      return { id: discountId };
    });
  } catch (error) {
    duplicateCode(error);
  }
}

/** Slet en kode, der aldrig er brugt. Brugte koder deaktiveres i stedet. */
export async function deleteDiscount(ctx: PolicyContext, discountId: string) {
  assertCan(ctx, "catalog:write");
  assertId(discountId);
  return db.$transaction(async (tx) => {
    const discount = await tx.discount.findUnique({
      where: { id: discountId },
      select: { code: true, _count: { select: { bookings: true, redemptions: true } } },
    });
    if (!discount) throw new AppError("NOT_FOUND", "Rabatkoden findes ikke");
    if (discount._count.bookings + discount._count.redemptions > 0) {
      throw new AppError("CONFLICT", "Rabatkoden er brugt", { reason: "IN_USE" });
    }
    await tx.discount.delete({ where: { id: discountId } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "discount.delete",
      entityType: "Discount",
      entityId: discountId,
      diff: { code: discount.code },
    });
  });
}
