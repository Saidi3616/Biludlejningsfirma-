import "server-only";
import { AppError } from "@/lib/errors";
import { quoteRequestSchema, type QuoteRequest } from "@/lib/validation/quote";
import { db } from "@/server/db";
import { quote } from "./quote";
import type { PricedDiscount, Quote } from "./types";

function dateKey(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Henter priser, ekstraudstyr, lokationer og rabat fra databasen og beregner prisen.
 * Ingen sideeffekter: rabatkoden bliver først brugt, når bookingen bekræftes (M7).
 */
export async function getQuote(
  request: QuoteRequest,
  context: { customerId?: string | null; now?: Date } = {},
): Promise<Quote> {
  const parsed = quoteRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Ugyldig forespørgsel", {
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  const input = parsed.data;
  const now = context.now ?? new Date();

  const [model, pickup, returnLocation] = await Promise.all([
    db.carModel.findFirst({ where: { id: input.carModelId, isActive: true } }),
    db.location.findFirst({
      where: { id: input.pickupLocationId, isActive: true },
      include: { deliveryZones: true },
    }),
    db.location.findFirst({ where: { id: input.returnLocationId, isActive: true } }),
  ]);
  if (!model) throw new AppError("NOT_FOUND", "Bilmodellen findes ikke");
  if (!pickup || !returnLocation) throw new AppError("NOT_FOUND", "Lokationen findes ikke");

  const codes = input.extras.filter((extra) => extra.quantity > 0).map((extra) => extra.code);
  const [rules, extras, discount] = await Promise.all([
    db.pricingRule.findMany({
      where: {
        categoryId: model.categoryId,
        OR: [{ carModelId: null }, { carModelId: model.id }],
      },
    }),
    db.extra.findMany({ where: { code: { in: codes }, isActive: true } }),
    input.discountCode ? loadDiscount(input.discountCode, context.customerId ?? null) : null,
  ]);

  const unknown = codes.filter((code) => !extras.some((extra) => extra.code === code));
  if (unknown.length > 0) {
    throw new AppError("VALIDATION_FAILED", "Ekstraudstyret findes ikke", { extras: unknown });
  }

  return quote({
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
    timeZone: pickup.timezone,
    model,
    rules: rules.map((rule) => ({
      ...rule,
      validFrom: dateKey(rule.validFrom),
      validTo: dateKey(rule.validTo),
    })),
    extras: input.extras
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        extra: extras.find((extra) => extra.code === item.code)!,
        quantity: item.quantity,
      })),
    delivery: input.delivery
      ? {
          enabled: pickup.deliveryEnabled,
          zones: pickup.deliveryZones,
          distanceKm: input.delivery.distanceKm,
        }
      : null,
    oneWayFeeMinor: pickup.id === returnLocation.id ? null : returnLocation.oneWayFeeMinor,
    discount,
    now,
  });
}

async function loadDiscount(code: string, customerId: string | null): Promise<PricedDiscount> {
  const discount = await db.discount.findUnique({
    where: { code },
    include: { categories: { select: { id: true } }, carModels: { select: { id: true } } },
  });
  if (!discount) {
    throw new AppError("DISCOUNT_INVALID", "Rabatkoden kan ikke bruges", {
      code,
      reason: "NOT_FOUND",
    });
  }
  const [usedTotal, usedByCustomer] = await Promise.all([
    db.discountRedemption.count({ where: { discountId: discount.id } }),
    customerId
      ? db.discountRedemption.count({ where: { discountId: discount.id, customerId } })
      : 0,
  ]);
  return {
    ...discount,
    categoryIds: discount.categories.map((category) => category.id),
    carModelIds: discount.carModels.map((carModel) => carModel.id),
    usedTotal,
    usedByCustomer,
  };
}
