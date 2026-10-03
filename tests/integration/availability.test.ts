import { beforeEach, describe, expect, it } from "vitest";
import { checkAvailability, searchAvailability } from "@/server/availability/service";
import { db } from "@/server/db";
import { addPrices, bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;

const now = new Date("2026-05-01T08:00:00Z");
const period = {
  pickupAt: "2026-06-01T10:00:00+02:00",
  returnAt: "2026-06-04T10:00:00+02:00",
};

function search(overrides: Record<string, unknown> = {}) {
  return {
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    ...period,
    ...overrides,
  };
}

/** En dyrere model i en anden kategori med én bil. */
async function createPremium() {
  const category = await db.carCategory.create({
    data: { slug: "premium", nameI18n: { da: "Premium" } },
  });
  const model = await db.carModel.create({
    data: {
      categoryId: category.id,
      slug: "premium-model",
      brand: "Premium",
      model: "X",
      year: 2026,
      transmission: "AUTOMATIC",
      fuel: "ELECTRIC",
      seats: 5,
      bags: 3,
      doors: 5,
      includedKmPerDay: 300,
      extraKmFeeMinor: 300,
      depositMinor: 500000,
    },
  });
  await db.car.create({
    data: {
      carModelId: model.id,
      homeLocationId: fleet.location.id,
      registrationNumber: "PR 00 001",
      vin: "PREM00000000000001",
      odometerKm: 10,
    },
  });
  await db.pricingRule.create({
    data: { categoryId: category.id, minDays: 1, packageMinor: 99900, perDayMinor: 99900 },
  });
  return { category, model };
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  await addPrices(fleet);
});

describe("søg ledige biler", () => {
  it("viser ledige modeller med antal biler og totalpris, billigste først", async () => {
    const premium = await createPremium();
    const results = await searchAvailability(search(), { now });
    expect(results.map((result) => [result.carModelId, result.freeCars])).toEqual([
      [fleet.carModel.id, 2],
      [premium.model.id, 1],
    ]);
    expect(results[0]!.quote.totalMinor).toBe(99900);
    expect(results[1]!.quote.totalMinor).toBe(3 * 99900);
  });

  it("optagne, udløbne og uprissatte biler", async () => {
    const premium = await createPremium();
    await db.booking.create({
      data: bookingData(fleet, fleet.carA.id, "2026-06-02T08:00:00Z", "2026-06-03T08:00:00Z"),
    });
    // En reservation, hvis betalingsfrist er udløbet, blokerer ikke.
    await db.booking.create({
      data: {
        ...bookingData(fleet, fleet.carB.id, "2026-06-02T08:00:00Z", "2026-06-03T08:00:00Z"),
        status: "PENDING_PAYMENT",
        expiresAt: new Date(now.getTime() - 1),
      },
    });
    await db.pricingRule.deleteMany({ where: { categoryId: premium.category.id } });

    const results = await searchAvailability(search(), { now });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ carModelId: fleet.carModel.id, freeCars: 1 });
  });

  it("filtrerer på kategori og kun biler fra afhentningsstedet", async () => {
    const premium = await createPremium();
    const filtered = await searchAvailability(search({ categoryId: premium.category.id }), { now });
    expect(filtered.map((result) => result.carModelId)).toEqual([premium.model.id]);

    const other = await db.location.create({
      data: {
        slug: "odense",
        name: "Odense",
        address: "Vej 3",
        postalCode: "5000",
        city: "Odense",
        lat: 55.4,
        lng: 10.39,
      },
    });
    expect(await searchAvailability(search({ pickupLocationId: other.id }), { now })).toEqual([]);
  });

  it("ugyldig periode afvises", async () => {
    await expect(
      searchAvailability(search({ returnAt: period.pickupAt }), { now }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      searchAvailability(search({ pickupLocationId: "nope" }), { now }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { fields: ["pickupLocationId"] },
    });
  });
});

describe("er modellen ledig?", () => {
  it("ja: antal ledige biler", async () => {
    const result = await checkAvailability({ ...search(), carModelId: fleet.carModel.id }, { now });
    expect(result).toMatchObject({
      available: true,
      freeCars: 2,
      nextAvailable: [],
      alternatives: [],
    });
  });

  it("nej: foreslår næste ledige datoer og andre biler", async () => {
    const premium = await createPremium();
    for (const car of [fleet.carA, fleet.carB]) {
      await db.booking.create({
        data: bookingData(fleet, car.id, "2026-06-01T08:00:00Z", "2026-06-04T08:00:00Z", {
          bufferMinutes: 120,
        }),
      });
    }
    const result = await checkAvailability({ ...search(), carModelId: fleet.carModel.id }, { now });
    expect(result.available).toBe(false);
    // Optaget til 4. juni kl. 12 (inkl. buffer). Samme lejelængde kan tidligst starte 5. juni.
    expect(result.nextAvailable.map((slot) => slot.pickupAt.toISOString())).toEqual([
      "2026-06-05T08:00:00.000Z",
      "2026-06-06T08:00:00.000Z",
      "2026-06-07T08:00:00.000Z",
    ]);
    expect(result.alternatives.map((alternative) => alternative.carModelId)).toEqual([
      premium.model.id,
    ]);
  });
});
