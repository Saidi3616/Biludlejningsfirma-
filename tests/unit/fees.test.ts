import { describe, expect, it } from "vitest";
import { feeRates, rentalRules } from "@/config/rental";
import { suggestFees, type FeeInput } from "@/server/pricing/fees";

const returnAt = new Date("2026-10-05T10:00:00Z");
const MINUTE = 60_000;

const base: FeeInput = {
  pickupKm: 10_000,
  returnKm: 10_500,
  rentalDays: 3,
  includedKmPerDay: 200,
  extraKmFeeMinor: 250,
  pickupFuel: 8,
  returnFuel: 8,
  returnAt,
  returnedAt: returnAt,
};

const late = (minutes: number) =>
  suggestFees({ ...base, returnedAt: new Date(returnAt.getTime() + minutes * MINUTE) }).late;

describe("tillæg efter aflevering", () => {
  it("ingen tillæg inden for inkluderede km, fuld tank og til tiden", () => {
    const fees = suggestFees(base);
    expect(fees.drivenKm).toBe(500);
    expect(fees.includedKm).toBe(600);
    expect(fees.extraKm.totalMinor).toBe(0);
    expect(fees.fuel.totalMinor).toBe(0);
    expect(fees.late.totalMinor).toBe(0);
  });

  it("ekstra km ud over det inkluderede", () => {
    const fees = suggestFees({ ...base, returnKm: 10_800 });
    expect(fees.extraKm).toEqual({ quantity: 200, unitPriceMinor: 250, totalMinor: 50_000 });
  });

  it("manglende brændstof pr. ottendedel; mere brændstof giver ikke penge tilbage", () => {
    expect(suggestFees({ ...base, returnFuel: 5 }).fuel).toEqual({
      quantity: 3,
      unitPriceMinor: feeRates.fuelPerEighthMinor,
      totalMinor: 3 * feeRates.fuelPerEighthMinor,
    });
    expect(suggestFees({ ...base, pickupFuel: 4, returnFuel: 8 }).fuel.totalMinor).toBe(0);
  });

  it("for sen aflevering: gratis inden for fristen, derefter pr. påbegyndt time", () => {
    expect(late(-30).quantity).toBe(0);
    expect(late(rentalRules.graceMinutes).quantity).toBe(0);
    expect(late(rentalRules.graceMinutes + 1).quantity).toBe(1);
    expect(late(rentalRules.graceMinutes + 60).quantity).toBe(1);
    expect(late(rentalRules.graceMinutes + 61).quantity).toBe(2);
    expect(late(180)).toMatchObject({
      quantity: 3,
      totalMinor: 3 * feeRates.latePerHourMinor,
      minutesLate: 180,
    });
  });

  it("højst et loft af timer pr. påbegyndt døgn", () => {
    const cap = feeRates.lateMaxHoursPerDay;
    expect(late(rentalRules.graceMinutes + 20 * 60).quantity).toBe(cap);
    // 26 timer efter fristen: et helt døgn (loft) plus 2 timer.
    expect(late(rentalRules.graceMinutes + 26 * 60).quantity).toBe(cap + 2);
  });

  it("km kan ikke blive negative", () => {
    expect(suggestFees({ ...base, returnKm: 9_000 }).drivenKm).toBe(0);
  });
});
