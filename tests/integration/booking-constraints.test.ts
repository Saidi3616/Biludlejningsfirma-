import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { bookingData, createFleet, resetDb, violatedConstraint } from "./helpers";

let fleet: Awaited<ReturnType<typeof createFleet>>;

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
});

afterAll(async () => {
  await db.$disconnect();
});

const book = (
  carId: string,
  from: string,
  to: string,
  options?: Parameters<typeof bookingData>[4],
) => db.booking.create({ data: bookingData(fleet, carId, from, to, options) });

describe("dobbeltbooking", () => {
  it("afviser en overlappende booking af samme bil", async () => {
    await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z");
    expect(
      await violatedConstraint(book(fleet.carA.id, "2026-11-03T09:00Z", "2026-11-06T09:00Z")),
    ).toBe("booking_no_overlap");
  });

  it("afviser en booking der ligger helt inden i en anden", async () => {
    await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-10T09:00Z");
    expect(
      await violatedConstraint(book(fleet.carA.id, "2026-11-03T09:00Z", "2026-11-04T09:00Z")),
    ).toBe("booking_no_overlap");
  });

  it("tillader bookinger der støder op til hinanden", async () => {
    await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z");
    await expect(
      book(fleet.carA.id, "2026-11-04T09:00Z", "2026-11-06T09:00Z"),
    ).resolves.toBeDefined();
  });

  it("tillader samme periode på en anden bil", async () => {
    await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z");
    await expect(
      book(fleet.carB.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z"),
    ).resolves.toBeDefined();
  });

  it("medregner klargøringsbufferen", async () => {
    await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z", { bufferMinutes: 120 });
    // Starter én time efter aflevering, men bufferen er to timer.
    expect(
      await violatedConstraint(book(fleet.carA.id, "2026-11-04T10:00Z", "2026-11-05T10:00Z")),
    ).toBe("booking_no_overlap");
  });

  it.each(["CANCELLED", "EXPIRED", "COMPLETED", "NO_SHOW"] as const)(
    "en %s booking blokerer ikke bilen",
    async (status) => {
      await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z", { status });
      await expect(
        book(fleet.carA.id, "2026-11-02T09:00Z", "2026-11-03T09:00Z"),
      ).resolves.toBeDefined();
    },
  );

  it("en reservation der afventer betaling blokerer bilen", async () => {
    await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z", {
      status: "PENDING_PAYMENT",
    });
    expect(
      await violatedConstraint(book(fleet.carA.id, "2026-11-02T09:00Z", "2026-11-03T09:00Z")),
    ).toBe("booking_no_overlap");
  });

  it("en annulleret booking kan ikke genaktiveres, hvis bilen er taget imens", async () => {
    const cancelled = await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z", {
      status: "CANCELLED",
    });
    await book(fleet.carA.id, "2026-11-02T09:00Z", "2026-11-03T09:00Z");
    expect(
      await violatedConstraint(
        db.booking.update({ where: { id: cancelled.id }, data: { status: "CONFIRMED" } }),
      ),
    ).toBe("booking_no_overlap");
  });

  it("20 samtidige forsøg på samme bil og periode: præcis ét lykkes", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        book(fleet.carA.id, "2026-12-20T09:00Z", "2026-12-27T09:00Z"),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(await db.booking.count({ where: { carId: fleet.carA.id } })).toBe(1);
  });
});

describe("vedligehold", () => {
  const maintenance = (from: string, to: string, status: "PLANNED" | "DONE" = "PLANNED") =>
    db.maintenance.create({
      data: {
        carId: fleet.carA.id,
        type: "SERVICE",
        status,
        startsAt: new Date(from),
        endsAt: new Date(to),
      },
    });

  it("en bil på værksted kan ikke bookes i perioden", async () => {
    await maintenance("2026-11-02T08:00Z", "2026-11-02T16:00Z");
    expect(
      await violatedConstraint(book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z")),
    ).toBe("booking_maintenance_overlap");
  });

  it("service kan ikke planlægges oven i en aktiv booking", async () => {
    await book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z");
    expect(await violatedConstraint(maintenance("2026-11-02T08:00Z", "2026-11-02T16:00Z"))).toBe(
      "maintenance_booking_overlap",
    );
  });

  it("afsluttet vedligehold blokerer ikke", async () => {
    await maintenance("2026-11-02T08:00Z", "2026-11-02T16:00Z", "DONE");
    await expect(
      book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z"),
    ).resolves.toBeDefined();
  });

  it("booking og service oprettet samtidig: kun den ene lykkes", async () => {
    for (let round = 0; round < 10; round++) {
      await db.booking.deleteMany();
      await db.maintenance.deleteMany();
      const results = await Promise.allSettled([
        book(fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z"),
        maintenance("2026-11-02T08:00Z", "2026-11-02T16:00Z"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    }
  });
});

describe("datavalidering i databasen", () => {
  it("afviser aflevering før afhentning", async () => {
    expect(
      await violatedConstraint(book(fleet.carA.id, "2026-11-04T09:00Z", "2026-11-01T09:00Z")),
    ).toBe("booking_return_after_pickup");
  });

  it("afviser en blokeret periode der ikke dækker lejeperioden", async () => {
    const data = bookingData(fleet, fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z");
    expect(
      await violatedConstraint(
        db.booking.create({ data: { ...data, blockedUntil: new Date("2026-11-03T09:00Z") } }),
      ),
    ).toBe("booking_blocked_covers_rental");
  });

  it("afviser negative beløb", async () => {
    const data = bookingData(fleet, fleet.carA.id, "2026-11-01T09:00Z", "2026-11-04T09:00Z");
    expect(await violatedConstraint(db.booking.create({ data: { ...data, totalMinor: -1 } }))).toBe(
      "booking_amounts_non_negative",
    );
  });

  it("afviser brændstofniveau uden for 0–8", async () => {
    expect(
      await violatedConstraint(
        db.car.update({ where: { id: fleet.carA.id }, data: { fuelLevel: 9 } }),
      ),
    ).toBe("car_fuel_level_range");
  });

  it("rabatkoder skal være med store bogstaver og have gyldig værdi", async () => {
    expect(
      await violatedConstraint(
        db.discount.create({ data: { code: "velkommen", type: "PERCENT", value: 10 } }),
      ),
    ).toBe("discount_code_uppercase");
    expect(
      await violatedConstraint(
        db.discount.create({ data: { code: "FOR-MEGET", type: "PERCENT", value: 150 } }),
      ),
    ).toBe("discount_value_valid");
  });
});
