import { percentOf } from "@/lib/money";
import type { PricedDiscount } from "./types";

export type DiscountRejection =
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "NOT_APPLICABLE"
  | "MIN_DAYS"
  | "MIN_AMOUNT"
  | "USED_UP"
  | "ALREADY_USED"
  | "CURRENCY";

/**
 * Tjekker en rabatkode og beregner rabatten. `baseMinor` er leje + ekstraudstyr;
 * gebyrer (levering, one-way) gives der ikke rabat på. Rabatten kan aldrig overstige grundlaget.
 */
export function evaluateDiscount(
  discount: PricedDiscount,
  context: {
    baseMinor: number;
    currency: string;
    rentalDays: number;
    categoryId: string;
    carModelId: string;
    now: Date;
  },
): { ok: true; amountMinor: number } | { ok: false; reason: DiscountRejection } {
  const reject = (reason: DiscountRejection) => ({ ok: false as const, reason });

  if (!discount.isActive) return reject("INACTIVE");
  if (discount.validFrom && context.now < discount.validFrom) return reject("NOT_STARTED");
  if (discount.validTo && context.now > discount.validTo) return reject("EXPIRED");

  const restricted = discount.categoryIds.length > 0 || discount.carModelIds.length > 0;
  if (
    restricted &&
    !discount.categoryIds.includes(context.categoryId) &&
    !discount.carModelIds.includes(context.carModelId)
  ) {
    return reject("NOT_APPLICABLE");
  }
  if (discount.minDays !== null && context.rentalDays < discount.minDays) return reject("MIN_DAYS");
  if (discount.minBookingMinor !== null && context.baseMinor < discount.minBookingMinor) {
    return reject("MIN_AMOUNT");
  }
  if (discount.maxUses !== null && discount.usedTotal >= discount.maxUses) return reject("USED_UP");
  if (
    discount.maxUsesPerCustomer !== null &&
    discount.usedByCustomer >= discount.maxUsesPerCustomer
  ) {
    return reject("ALREADY_USED");
  }

  if (discount.type === "PERCENT") {
    return {
      ok: true,
      amountMinor: Math.min(percentOf(context.baseMinor, discount.value), context.baseMinor),
    };
  }
  if (discount.currency !== null && discount.currency !== context.currency)
    return reject("CURRENCY");
  return { ok: true, amountMinor: Math.min(discount.value, context.baseMinor) };
}
