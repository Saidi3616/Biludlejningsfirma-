import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { applicableTiers, rentalPrice } from "@/server/pricing/ladder";
import { quote } from "@/server/pricing/quote";
import type { PricedDiscount, PricedExtra, PriceRule, QuoteInput } from "@/server/pricing/types";

const kr = (value: number) => Math.round(value * 100);

/** Economy-trappen fra kravene: 399 / 999 / 1.999 / 6.999 kr. for 1 / 3 / 7 / 30 dage. */
function ladder(packages: [number, number][], extra: Partial<PriceRule> = {}): PriceRule[] {
  return packages.map(([minDays, packageKr], index) => ({
    id: `rule-${index}-${extra.carModelId ?? "cat"}-${extra.priority ?? 0}`,
    carModelId: null,
    minDays,
    packageMinor: kr(packageKr),
    perDayMinor: Math.round(kr(packageKr) / minDays),
    currency: "DKK",
    validFrom: null,
    validTo: null,
    priority: 0,
    ...extra,
  }));
}

const economy = ladder([
  [1, 399],
  [3, 999],
  [7, 1999],
  [30, 6999],
]);

const model = {
  id: "model-1",
  categoryId: "economy",
  depositMinor: kr(3000),
  includedKmPerDay: 200,
  extraKmFeeMinor: kr(2.5),
  currency: "DKK",
};

const childSeat: PricedExtra = {
  id: "extra-seat",
  code: "child_seat",
  pricing: "PER_DAY",
  priceMinor: kr(50),
  maxPriceMinor: kr(350),
  maxQuantity: 2,
  currency: "DKK",
  isActive: true,
};

const airport: PricedExtra = {
  id: "extra-airport",
  code: "airport_service",
  pricing: "PER_BOOKING",
  priceMinor: kr(150),
  maxPriceMinor: null,
  maxQuantity: 1,
  currency: "DKK",
  isActive: true,
};

function discount(overrides: Partial<PricedDiscount> = {}): PricedDiscount {
  return {
    id: "discount-1",
    code: "VELKOMMEN10",
    type: "PERCENT",
    value: 10,
    currency: null,
    validFrom: null,
    validTo: null,
    minBookingMinor: null,
    minDays: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    isActive: true,
    categoryIds: [],
    carModelIds: [],
    usedTotal: 0,
    usedByCustomer: 0,
    ...overrides,
  };
}

const pickupAt = new Date("2026-06-01T10:00:00+02:00");
const plusDays = (days: number, extraMinutes = 0) =>
  new Date(pickupAt.getTime() + days * 86_400_000 + extraMinutes * 60_000);

function input(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    pickupAt,
    returnAt: plusDays(3),
    timeZone: "Europe/Copenhagen",
    model,
    rules: economy,
    extras: [],
    delivery: null,
    oneWayFeeMinor: null,
    discount: null,
    now: new Date("2026-05-01T12:00:00Z"),
    ...overrides,
  };
}

function errorOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  return null;
}

describe("pristrappe (K3)", () => {
  const price = (days: number) => rentalPrice(economy, days)?.totalMinor;

  it.each([
    [1, 399],
    [2, 798],
    [3, 999],
    [4, 1332],
    [5, 1665],
    [6, 1998],
    [7, 1999],
    [8, 2285],
    [24, 6854],
    [25, 6999],
    [29, 6999],
    [30, 6999],
    [31, 7232],
    [60, 13998],
  ])("%i dage koster %i kr.", (days, expectedKr) => {
    expect(price(days)).toBe(kr(expectedKr));
  });

  it("25 dage loftes af 30-dages-pakken", () => {
    expect(rentalPrice(economy, 25)?.cappedByNextPackage).toBe(true);
    expect(rentalPrice(economy, 24)?.cappedByNextPackage).toBe(false);
  });

  it("flere dage koster aldrig mindre end færre dage, og priser er hele kroner", () => {
    for (let days = 1; days < 90; days++) {
      expect(price(days + 1)!).toBeGreaterThanOrEqual(price(days)!);
      expect(price(days)! % 100).toBe(0);
    }
  });

  it("uden regler er der ingen pris", () => {
    expect(rentalPrice([], 3)).toBeNull();
  });
});

describe("hvilke prisregler gælder (K4)", () => {
  it("en model-override erstatter kategoriens priser", () => {
    const override = ladder([[1, 499]], { carModelId: "model-1" });
    const tiers = applicableTiers([...economy, ...override], "model-1", "2026-06-01");
    expect(tiers).toHaveLength(1);
    expect(tiers[0].packageMinor).toBe(kr(499));
    // Andre modeller i kategorien bruger stadig kategoriens priser.
    expect(applicableTiers([...economy, ...override], "model-2", "2026-06-01")).toHaveLength(4);
  });

  it("sæsonpris med højere prioritet gælder kun i perioden", () => {
    const summer = ladder([[1, 499]], {
      priority: 10,
      validFrom: "2026-07-01",
      validTo: "2026-08-31",
    });
    const rules = [...economy, ...summer];
    expect(applicableTiers(rules, "model-1", "2026-06-30")[0].packageMinor).toBe(kr(399));
    expect(applicableTiers(rules, "model-1", "2026-07-01")[0].packageMinor).toBe(kr(499));
    expect(applicableTiers(rules, "model-1", "2026-08-31")[0].packageMinor).toBe(kr(499));
    expect(applicableTiers(rules, "model-1", "2026-09-01")[0].packageMinor).toBe(kr(399));
  });

  it("sæsonen afgøres af afhentningsdatoen i lokal tid", () => {
    const summer = ladder([[1, 499]], { priority: 10, validFrom: "2026-07-01", validTo: null });
    // 30. juni kl. 23:30 UTC er 1. juli kl. 01:30 i København.
    const result = quote(
      input({
        rules: [...economy, ...summer],
        pickupAt: new Date("2026-06-30T23:30:00Z"),
        returnAt: new Date("2026-07-01T23:30:00Z"),
      }),
    );
    expect(result.totalMinor).toBe(kr(499));
  });
});

describe("quote", () => {
  it("3 dage economy uden tilvalg", () => {
    const result = quote(input());
    expect(result.rentalDays).toBe(3);
    expect(result.lines).toEqual([
      { type: "RENTAL", code: "rental", quantity: 3, unitPriceMinor: kr(333), totalMinor: kr(999) },
    ]);
    expect(result.subtotalMinor).toBe(kr(999));
    expect(result.totalMinor).toBe(kr(999));
    expect(result.vatMinor).toBe(kr(199.8));
    expect(result.includedKm).toBe(600);
    expect(result.extraKmFeeMinor).toBe(kr(2.5));
    expect(result.tier).toEqual({
      minDays: 3,
      perDayMinor: kr(333),
      packageMinor: kr(999),
      cappedByNextPackage: false,
    });
  });

  it("59 minutters forsinkelse koster ikke en ekstra dag; 60 minutter gør", () => {
    expect(quote(input({ returnAt: plusDays(3, 59) })).rentalDays).toBe(3);
    expect(quote(input({ returnAt: plusDays(3, 60) })).rentalDays).toBe(4);
  });

  it("ekstraudstyr pr. dag har loft; pr. booking er fast pris", () => {
    const result = quote(
      input({
        returnAt: plusDays(10),
        extras: [
          { extra: childSeat, quantity: 2 },
          { extra: airport, quantity: 1 },
        ],
      }),
    );
    const seat = result.lines.find((line) => line.code === "child_seat")!;
    // 10 × 50 = 500 kr., loftet til 350 kr. pr. stk.
    expect(seat).toMatchObject({ quantity: 2, unitPriceMinor: kr(350), totalMinor: kr(700) });
    const service = result.lines.find((line) => line.code === "airport_service")!;
    expect(service).toMatchObject({ quantity: 1, unitPriceMinor: kr(150), totalMinor: kr(150) });
    expect(result.subtotalMinor).toBe(rentalPrice(economy, 10)!.totalMinor + kr(850));
  });

  it("ekstraudstyr pr. dag under loftet", () => {
    const result = quote(input({ extras: [{ extra: childSeat, quantity: 1 }] }));
    expect(result.lines[1]).toMatchObject({ unitPriceMinor: kr(150), totalMinor: kr(150) });
  });

  it("for mange eller inaktivt ekstraudstyr afvises", () => {
    expect(errorOf(() => quote(input({ extras: [{ extra: childSeat, quantity: 3 }] })))?.code).toBe(
      "VALIDATION_FAILED",
    );
    expect(
      errorOf(() =>
        quote(input({ extras: [{ extra: { ...childSeat, isActive: false }, quantity: 1 }] })),
      )?.code,
    ).toBe("VALIDATION_FAILED");
  });

  describe("levering", () => {
    const zones = [
      { maxDistanceKm: 25, feeMinor: kr(299), currency: "DKK" },
      { maxDistanceKm: 10, feeMinor: kr(149), currency: "DKK" },
    ];

    it("vælger den mindste zone, adressen ligger i", () => {
      const near = quote(input({ delivery: { enabled: true, zones, distanceKm: 8 } }));
      expect(near.lines.at(-1)).toMatchObject({ type: "DELIVERY_FEE", totalMinor: kr(149) });
      const edge = quote(input({ delivery: { enabled: true, zones, distanceKm: 10 } }));
      expect(edge.lines.at(-1)?.totalMinor).toBe(kr(149));
      const far = quote(input({ delivery: { enabled: true, zones, distanceKm: 18 } }));
      expect(far.lines.at(-1)?.totalMinor).toBe(kr(299));
    });

    it("uden for zonerne, eller hvis lokationen ikke leverer, afvises", () => {
      expect(
        errorOf(() => quote(input({ delivery: { enabled: true, zones, distanceKm: 26 } })))?.code,
      ).toBe("OUTSIDE_DELIVERY_ZONE");
      expect(
        errorOf(() => quote(input({ delivery: { enabled: false, zones, distanceKm: 5 } })))?.code,
      ).toBe("OUTSIDE_DELIVERY_ZONE");
    });
  });

  it("aflevering et andet sted giver one-way-gebyr", () => {
    const result = quote(input({ oneWayFeeMinor: kr(500) }));
    expect(result.lines.at(-1)).toMatchObject({ type: "ONE_WAY_FEE", totalMinor: kr(500) });
    expect(result.totalMinor).toBe(kr(1499));
  });

  describe("rabat", () => {
    it("procent af leje + ekstraudstyr, ikke af gebyrer", () => {
      const result = quote(
        input({
          extras: [{ extra: airport, quantity: 1 }],
          oneWayFeeMinor: kr(500),
          discount: discount(),
        }),
      );
      // 10 % af (999 + 150) = 114,90 kr.
      expect(result.discountMinor).toBe(kr(114.9));
      expect(result.subtotalMinor).toBe(kr(1649));
      expect(result.totalMinor).toBe(kr(1649) - kr(114.9));
      expect(result.lines.at(-1)).toMatchObject({ type: "DISCOUNT", totalMinor: -kr(114.9) });
      expect(result.discountCode).toBe("VELKOMMEN10");
    });

    it("fast beløb kan ikke blive større end grundlaget", () => {
      const result = quote(input({ discount: discount({ type: "FIXED", value: kr(5000) }) }));
      expect(result.discountMinor).toBe(kr(999));
      expect(result.totalMinor).toBe(0);
    });

    it.each([
      ["INACTIVE", { isActive: false }],
      ["NOT_STARTED", { validFrom: new Date("2026-06-01T00:00:00Z") }],
      ["EXPIRED", { validTo: new Date("2026-04-30T00:00:00Z") }],
      ["MIN_DAYS", { minDays: 7 }],
      ["MIN_AMOUNT", { minBookingMinor: kr(1000) }],
      ["NOT_APPLICABLE", { categoryIds: ["suv"] }],
      ["USED_UP", { maxUses: 100, usedTotal: 100 }],
      ["ALREADY_USED", { maxUsesPerCustomer: 1, usedByCustomer: 1 }],
      ["CURRENCY", { type: "FIXED" as const, value: kr(100), currency: "EUR" }],
    ])("afvises: %s", (reason, overrides) => {
      const error = errorOf(() => quote(input({ discount: discount(overrides) })));
      expect(error?.code).toBe("DISCOUNT_INVALID");
      expect(error?.details?.reason).toBe(reason);
    });

    it("gælder, når kategorien eller modellen er med", () => {
      expect(quote(input({ discount: discount({ categoryIds: ["economy"] }) })).discountMinor).toBe(
        kr(99.9),
      );
      expect(quote(input({ discount: discount({ carModelIds: ["model-1"] }) })).discountMinor).toBe(
        kr(99.9),
      );
    });
  });

  describe("depositum (K6)", () => {
    it("holdes på kortet op til 7 dage, trækkes ved længere lejer", () => {
      expect(quote(input({ returnAt: plusDays(7) })).deposit).toEqual({
        amountMinor: kr(3000),
        mode: "HOLD",
      });
      expect(quote(input({ returnAt: plusDays(8) })).deposit.mode).toBe("CHARGE");
    });

    it("er ikke en del af totalen", () => {
      expect(quote(input()).totalMinor).toBe(kr(999));
    });
  });

  it("aflevering før afhentning og for lange lejer afvises", () => {
    expect(errorOf(() => quote(input({ returnAt: pickupAt })))?.code).toBe("VALIDATION_FAILED");
    expect(errorOf(() => quote(input({ returnAt: plusDays(91) })))?.code).toBe("VALIDATION_FAILED");
    expect(quote(input({ returnAt: plusDays(90) })).rentalDays).toBe(90);
  });

  it("uden prisregler, eller med anden valuta, er der ingen pris", () => {
    expect(errorOf(() => quote(input({ rules: [] })))?.code).toBe("PRICE_UNAVAILABLE");
    expect(
      errorOf(() => quote(input({ rules: ladder([[1, 50]], { currency: "EUR" }) })))?.code,
    ).toBe("PRICE_UNAVAILABLE");
  });

  it("alle beløb er heltal, og linjerne summerer til totalen", () => {
    for (let days = 1; days <= 40; days++) {
      const result = quote(
        input({
          returnAt: plusDays(days),
          extras: [{ extra: childSeat, quantity: 1 }],
          discount: discount({ value: 15 }),
        }),
      );
      const sum = result.lines.reduce((total, line) => total + line.totalMinor, 0);
      expect(sum).toBe(result.totalMinor);
      for (const line of result.lines) expect(Number.isInteger(line.totalMinor)).toBe(true);
    }
  });
});
