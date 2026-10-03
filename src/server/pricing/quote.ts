import { rentalRules } from "@/config/rental";
import { localDateKey, rentalDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { assertMinor, sumMinor, vatIncluded } from "@/lib/money";
import { evaluateDiscount } from "./discount";
import { applicableTiers, rentalPrice } from "./ladder";
import type { Quote, QuoteInput, QuoteLine } from "./types";

/**
 * Prisberegning for én leje. Ren funktion: samme input giver altid samme pris, og den bruges
 * af katalog, bilside, checkout og API. Ved booking genberegnes prisen altid på serveren.
 */
export function quote(input: QuoteInput): Quote {
  const { model } = input;
  const currency = model.currency;

  let days: number;
  try {
    days = rentalDays(input.pickupAt, input.returnAt, input.timeZone, rentalRules.graceMinutes);
  } catch {
    throw new AppError("VALIDATION_FAILED", "Afleveringen skal ligge efter afhentningen", {
      field: "returnAt",
    });
  }
  if (days > rentalRules.maxRentalDays) {
    throw new AppError("VALIDATION_FAILED", "Lejeperioden er for lang", {
      field: "returnAt",
      maxDays: rentalRules.maxRentalDays,
    });
  }

  // Leje
  const tiers = applicableTiers(
    input.rules,
    model.id,
    localDateKey(input.pickupAt, input.timeZone),
  );
  const rental = rentalPrice(tiers, days);
  if (!rental || rental.tier.currency !== currency) {
    throw new AppError("PRICE_UNAVAILABLE", "Ingen pris for denne bil i perioden");
  }
  const lines: QuoteLine[] = [
    {
      type: "RENTAL",
      code: "rental",
      quantity: days,
      // Enhedsprisen er gennemsnittet; totalen er den, der gælder.
      unitPriceMinor: Math.round(rental.totalMinor / days),
      totalMinor: rental.totalMinor,
    },
  ];

  // Ekstraudstyr
  for (const { extra, quantity } of input.extras) {
    if (quantity === 0) continue;
    if (!extra.isActive || extra.currency !== currency) {
      throw new AppError("VALIDATION_FAILED", "Ekstraudstyret findes ikke", { extra: extra.code });
    }
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > extra.maxQuantity) {
      throw new AppError("VALIDATION_FAILED", "Ugyldigt antal", {
        extra: extra.code,
        maxQuantity: extra.maxQuantity,
      });
    }
    // Pr. dag med loft pr. stk. ved lange lejer; pr. booking er en fast pris.
    const unit =
      extra.pricing === "PER_DAY"
        ? Math.min(extra.priceMinor * days, extra.maxPriceMinor ?? Infinity)
        : extra.priceMinor;
    lines.push({
      type: "EXTRA",
      code: extra.code,
      extraId: extra.id,
      quantity,
      unitPriceMinor: assertMinor(unit),
      totalMinor: unit * quantity,
    });
  }

  const discountBase = sumMinor(lines.map((line) => line.totalMinor));

  // Levering
  if (input.delivery) {
    const { enabled, zones, distanceKm } = input.delivery;
    const zone = enabled
      ? zones
          .filter((candidate) => candidate.currency === currency)
          .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm)
          .find((candidate) => distanceKm <= candidate.maxDistanceKm)
      : undefined;
    if (!zone) {
      throw new AppError("OUTSIDE_DELIVERY_ZONE", "Levering er ikke mulig til adressen", {
        distanceKm,
      });
    }
    lines.push({
      type: "DELIVERY_FEE",
      code: "delivery",
      quantity: 1,
      unitPriceMinor: zone.feeMinor,
      totalMinor: zone.feeMinor,
    });
  }

  // Aflevering et andet sted
  if (input.oneWayFeeMinor) {
    lines.push({
      type: "ONE_WAY_FEE",
      code: "one_way",
      quantity: 1,
      unitPriceMinor: input.oneWayFeeMinor,
      totalMinor: input.oneWayFeeMinor,
    });
  }

  const subtotalMinor = sumMinor(lines.map((line) => line.totalMinor));

  // Rabat
  let discountMinor = 0;
  if (input.discount) {
    const result = evaluateDiscount(input.discount, {
      baseMinor: discountBase,
      currency,
      rentalDays: days,
      categoryId: model.categoryId,
      carModelId: model.id,
      now: input.now,
    });
    if (!result.ok) {
      throw new AppError("DISCOUNT_INVALID", "Rabatkoden kan ikke bruges", {
        code: input.discount.code,
        reason: result.reason,
      });
    }
    discountMinor = result.amountMinor;
    if (discountMinor > 0) {
      lines.push({
        type: "DISCOUNT",
        code: input.discount.code,
        quantity: 1,
        unitPriceMinor: -discountMinor,
        totalMinor: -discountMinor,
      });
    }
  }

  const totalMinor = subtotalMinor - discountMinor;

  return {
    currency,
    rentalDays: days,
    tier: {
      minDays: rental.tier.minDays,
      perDayMinor: rental.tier.perDayMinor,
      packageMinor: rental.tier.packageMinor,
      cappedByNextPackage: rental.cappedByNextPackage,
    },
    lines,
    subtotalMinor,
    discountMinor,
    totalMinor,
    vatMinor: vatIncluded(totalMinor, rentalRules.vatRatePercent),
    deposit: {
      amountMinor: model.depositMinor,
      mode: days > rentalRules.depositHoldMaxDays ? "CHARGE" : "HOLD",
    },
    includedKm: model.includedKmPerDay * days,
    extraKmFeeMinor: model.extraKmFeeMinor,
    discountCode: discountMinor > 0 && input.discount ? input.discount.code : null,
  };
}
