/**
 * Regning med penge. Beløb er altid heltal i mindste enhed (øre) plus valutakode.
 * Funktionerne kaster ved ikke-heltal, så en float aldrig sniger sig ind i en pris.
 */

export type Money = { amountMinor: number; currency: string };

/** Mindste enheder pr. hel enhed (DKK, EUR, GBP: 100). */
const MINOR_PER_UNIT = 100;

export function assertMinor(value: number, label = "beløb"): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} skal være et heltal i mindste enhed`);
  return value;
}

/** Runder til nærmeste hele krone (K3). Halve runder op. */
export function roundToWholeUnits(amountMinor: number): number {
  assertMinor(amountMinor);
  return Math.round(amountMinor / MINOR_PER_UNIT) * MINOR_PER_UNIT;
}

/** `percent` procent af beløbet, rundet til nærmeste øre. */
export function percentOf(amountMinor: number, percent: number): number {
  assertMinor(amountMinor);
  return Math.round((amountMinor * percent) / 100);
}

/** Momsandelen af en pris inkl. moms (fx 25 %: 20 % af bruttoprisen). */
export function vatIncluded(grossMinor: number, ratePercent: number): number {
  assertMinor(grossMinor);
  return Math.round((grossMinor * ratePercent) / (100 + ratePercent));
}

export function sumMinor(values: readonly number[]): number {
  return values.reduce((total, value) => total + assertMinor(value), 0);
}
