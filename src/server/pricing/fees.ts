import { feeRates, rentalRules } from "@/config/rental";

export type FeeInput = {
  /** Km ved udlevering og aflevering. */
  pickupKm: number;
  returnKm: number;
  rentalDays: number;
  includedKmPerDay: number;
  extraKmFeeMinor: number;
  /** Brændstof eller batteri i ottendedele. */
  pickupFuel: number;
  returnFuel: number;
  /** Aftalt og faktisk afleveringstid. */
  returnAt: Date;
  returnedAt: Date;
};

export type FeeLine = { quantity: number; unitPriceMinor: number; totalMinor: number };

export type SuggestedFees = {
  drivenKm: number;
  includedKm: number;
  extraKm: FeeLine;
  fuel: FeeLine;
  /** Antal timer, der opkræves for (efter fristen og loftet pr. døgn). */
  late: FeeLine & { minutesLate: number };
};

const line = (quantity: number, unitPriceMinor: number): FeeLine => ({
  quantity,
  unitPriceMinor,
  totalMinor: quantity * unitPriceMinor,
});

/**
 * Forslag til tillæg efter aflevering (06-admin-flows.md F2, K14): ekstra km ud over det
 * inkluderede, manglende brændstof og for sen aflevering. Ren funktion. Personalet ser forslaget
 * og kan rette det, før det lægges på bookingen.
 */
export function suggestFees(input: FeeInput): SuggestedFees {
  const drivenKm = Math.max(0, input.returnKm - input.pickupKm);
  const includedKm = input.includedKmPerDay * input.rentalDays;
  const extraKm = Math.max(0, drivenKm - includedKm);

  const missingFuel = Math.max(0, input.pickupFuel - input.returnFuel);

  const minutesLate = Math.max(
    0,
    Math.floor((input.returnedAt.getTime() - input.returnAt.getTime()) / 60_000),
  );
  let lateHours = 0;
  if (minutesLate > rentalRules.graceMinutes) {
    // Pr. påbegyndt time efter fristen, højst `lateMaxHoursPerDay` timer pr. påbegyndt døgn.
    const hours = Math.ceil((minutesLate - rentalRules.graceMinutes) / 60);
    lateHours =
      Math.floor(hours / 24) * feeRates.lateMaxHoursPerDay +
      Math.min(hours % 24, feeRates.lateMaxHoursPerDay);
  }

  return {
    drivenKm,
    includedKm,
    extraKm: line(extraKm, input.extraKmFeeMinor),
    fuel: line(missingFuel, feeRates.fuelPerEighthMinor),
    late: { ...line(lateHours, feeRates.latePerHourMinor), minutesLate },
  };
}
