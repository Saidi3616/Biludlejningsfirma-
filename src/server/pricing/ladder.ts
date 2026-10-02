import { roundToWholeUnits } from "@/lib/money";
import type { PriceRule } from "./types";

/**
 * De regler, der gælder for en model på en given dato. Findes der regler for selve modellen,
 * bruges kun de; ellers kategoriens. Ved flere regler for samme antal dage vinder højeste
 * prioritet (fx en sæsonpris over standardprisen).
 */
export function applicableTiers(rules: PriceRule[], carModelId: string, dateKey: string) {
  const valid = rules.filter(
    (rule) =>
      (rule.validFrom === null || rule.validFrom <= dateKey) &&
      (rule.validTo === null || dateKey <= rule.validTo) &&
      (rule.carModelId === null || rule.carModelId === carModelId),
  );
  const modelRules = valid.filter((rule) => rule.carModelId === carModelId);
  const scope = modelRules.length > 0 ? modelRules : valid;

  const best = new Map<number, PriceRule>();
  for (const rule of scope) {
    const current = best.get(rule.minDays);
    if (!current || rule.priority > current.priority) best.set(rule.minDays, rule);
  }
  return [...best.values()].sort((a, b) => a.minDays - b.minDays);
}

/**
 * Lejeprisen efter pristrappen (K3):
 * - Præcis en pakkes antal dage koster pakkeprisen.
 * - Ellers dage × trappens dagspris, men aldrig mere end en større pakke.
 * - Rundet til hele kroner.
 */
export function rentalPrice(tiers: PriceRule[], days: number) {
  const tier = tiers.findLast((candidate) => candidate.minDays <= days);
  if (!tier) return null;

  if (tier.minDays === days) {
    return { tier, totalMinor: tier.packageMinor, cappedByNextPackage: false };
  }
  const linear = roundToWholeUnits(days * tier.perDayMinor);
  const larger = tiers.filter((candidate) => candidate.minDays > days);
  const cap = larger.length > 0 ? Math.min(...larger.map((t) => t.packageMinor)) : Infinity;
  return linear > cap
    ? { tier, totalMinor: cap, cappedByNextPackage: true }
    : { tier, totalMinor: linear, cappedByNextPackage: false };
}
