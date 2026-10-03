import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { db } from "@/server/db";
import { getQuote } from "@/server/pricing/service";
import { createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;

const kr = (value: number) => Math.round(value * 100);
const pickupAt = "2026-06-01T10:00:00+02:00";
const returnAt = "2026-06-04T10:00:00+02:00";

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  return null;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    carModelId: fleet.carModel.id,
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    pickupAt,
    returnAt,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  const categoryId = fleet.carModel.categoryId;
  await db.pricingRule.createMany({
    data: [
      [1, 399],
      [3, 999],
      [7, 1999],
      [30, 6999],
    ].map(([minDays, price]) => ({
      categoryId,
      minDays,
      packageMinor: kr(price),
      perDayMinor: Math.round(kr(price) / minDays),
    })),
  });
  await db.extra.createMany({
    data: [
      {
        code: "child_seat",
        nameI18n: { da: "Barnestol" },
        pricing: "PER_DAY",
        priceMinor: kr(50),
        maxPriceMinor: kr(350),
        maxQuantity: 2,
      },
      {
        code: "old_gps",
        nameI18n: { da: "GPS" },
        pricing: "PER_BOOKING",
        priceMinor: kr(100),
        isActive: false,
      },
    ],
  });
});

describe("getQuote mod databasen", () => {
  it("beregner leje og ekstraudstyr ud fra kategoriens priser", async () => {
    const result = await getQuote(request({ extras: [{ code: "child_seat", quantity: 1 }] }));
    expect(result.rentalDays).toBe(3);
    expect(result.totalMinor).toBe(kr(999 + 150));
    expect(result.deposit.amountMinor).toBe(fleet.carModel.depositMinor);
    expect(result.lines.find((line) => line.code === "child_seat")?.extraId).toBeDefined();
  });

  it("model-override og sæsonpris hentes korrekt (datoer uden tidszonefejl)", async () => {
    await db.pricingRule.create({
      data: {
        categoryId: fleet.carModel.categoryId,
        carModelId: fleet.carModel.id,
        minDays: 1,
        packageMinor: kr(450),
        perDayMinor: kr(450),
        validFrom: new Date("2026-06-01"),
        validTo: new Date("2026-06-01"),
        priority: 5,
      },
    });
    const onDay = await getQuote(request({ returnAt: "2026-06-02T10:00:00+02:00" }));
    expect(onDay.totalMinor).toBe(kr(450));
    const dayAfter = await getQuote(
      request({ pickupAt: "2026-06-02T10:00:00+02:00", returnAt: "2026-06-03T10:00:00+02:00" }),
    );
    expect(dayAfter.totalMinor).toBe(kr(399));
  });

  it("ukendt eller inaktivt ekstraudstyr afvises", async () => {
    const error = await errorOf(
      getQuote(
        request({
          extras: [
            { code: "old_gps", quantity: 1 },
            { code: "nope", quantity: 1 },
          ],
        }),
      ),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details?.extras).toEqual(["old_gps", "nope"]);
  });

  it("rabatkode: store/små bogstaver er ligegyldige, og brug pr. kunde tælles", async () => {
    const discount = await db.discount.create({
      data: { code: "VELKOMMEN10", type: "PERCENT", value: 10, maxUsesPerCustomer: 1 },
    });
    const ok = await getQuote(request({ discountCode: " velkommen10 " }), {
      customerId: fleet.customer.id,
    });
    expect(ok.discountMinor).toBe(kr(99.9));

    const booking = await db.booking.create({
      data: {
        reference: "BU-TEST01",
        customerId: fleet.customer.id,
        carModelId: fleet.carModel.id,
        carId: fleet.carA.id,
        pickupLocationId: fleet.location.id,
        returnLocationId: fleet.location.id,
        pickupAt: new Date(pickupAt),
        returnAt: new Date(returnAt),
        blockedFrom: new Date(pickupAt),
        blockedUntil: new Date(returnAt),
        status: "CANCELLED",
        subtotalMinor: kr(999),
        totalMinor: kr(899.1),
      },
    });
    await db.discountRedemption.create({
      data: {
        discountId: discount.id,
        bookingId: booking.id,
        customerId: fleet.customer.id,
        amountMinor: kr(99.9),
      },
    });

    const used = await errorOf(
      getQuote(request({ discountCode: "VELKOMMEN10" }), { customerId: fleet.customer.id }),
    );
    expect(used).toEqual({
      code: "DISCOUNT_INVALID",
      details: { code: "VELKOMMEN10", reason: "ALREADY_USED" },
    });
    // En anden (eller ukendt) kunde kan stadig bruge koden.
    expect((await getQuote(request({ discountCode: "VELKOMMEN10" }))).discountMinor).toBe(kr(99.9));
  });

  it("ukendt rabatkode", async () => {
    const error = await errorOf(getQuote(request({ discountCode: "FINDESIKKE" })));
    expect(error?.details).toEqual({ code: "FINDESIKKE", reason: "NOT_FOUND" });
  });

  it("aflevering et andet sted bruger afleveringsstedets gebyr", async () => {
    const other = await db.location.create({
      data: {
        slug: "aarhus",
        name: "Aarhus",
        address: "Eksempelvej 2",
        postalCode: "8000",
        city: "Aarhus",
        lat: 56.15,
        lng: 10.2,
        oneWayFeeMinor: kr(750),
      },
    });
    const result = await getQuote(request({ returnLocationId: other.id }));
    expect(result.lines.at(-1)).toMatchObject({ type: "ONE_WAY_FEE", totalMinor: kr(750) });
  });

  it("levering bruger afhentningsstedets zoner", async () => {
    await db.location.update({
      where: { id: fleet.location.id },
      data: {
        deliveryEnabled: true,
        deliveryZones: { create: [{ maxDistanceKm: 15, feeMinor: kr(199) }] },
      },
    });
    const result = await getQuote(request({ delivery: { distanceKm: 12 } }));
    expect(result.lines.at(-1)).toMatchObject({ type: "DELIVERY_FEE", totalMinor: kr(199) });
    expect((await errorOf(getQuote(request({ delivery: { distanceKm: 16 } }))))?.code).toBe(
      "OUTSIDE_DELIVERY_ZONE",
    );
  });

  it("inaktiv model og ugyldigt input afvises", async () => {
    await db.carModel.update({ where: { id: fleet.carModel.id }, data: { isActive: false } });
    expect((await errorOf(getQuote(request())))?.code).toBe("NOT_FOUND");
    const invalid = await errorOf(
      getQuote(request({ carModelId: "ikke-et-id", pickupAt: "i går" })),
    );
    expect(invalid?.code).toBe("VALIDATION_FAILED");
    expect(invalid?.details?.fields).toEqual(["carModelId", "pickupAt"]);
  });
});
