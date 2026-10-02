import { localDateKey, toLocal } from "@/lib/dates";

/** En række fra OPENING_HOURS. `specialDate` er "YYYY-MM-DD" (helligdag eller særlig dag). */
export type OpeningHoursRule = {
  weekday: number | null;
  specialDate: string | null;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

/** ISO-ugedag: 1 = mandag … 7 = søndag. */
function isoWeekday(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** "00:00" som lukketid betyder midnat i slutningen af dagen. */
function closingTime(value: string) {
  return value === "00:00" ? "24:00" : value;
}

/**
 * Har lokationen åbent på tidspunktet (målt på lokationens ur)?
 * - En særlig dato erstatter ugedagens åbningstider helt.
 * - Flere rækker samme dag er flere åbningsperioder (fx frokostlukket).
 * - Åbnings- og lukketid er begge med: ved lukketid 18:00 kan bilen hentes kl. 18:00.
 * - Uden nogen åbningstider er lokationen ikke begrænset (fx selvbetjening).
 */
export function isOpenAt(instant: Date, timeZone: string, rules: OpeningHoursRule[]): boolean {
  if (rules.length === 0) return true;

  const local = toLocal(instant, timeZone);
  const dateKey = localDateKey(instant, timeZone);
  const special = rules.filter((rule) => rule.specialDate === dateKey);
  const weekday = isoWeekday(local.year, local.month, local.day);
  const today =
    special.length > 0
      ? special
      : rules.filter((rule) => rule.specialDate === null && rule.weekday === weekday);

  if (today.length === 0 || today.some((rule) => rule.closed)) return false;

  const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  return today.some(
    (rule) =>
      rule.opensAt !== null &&
      rule.closesAt !== null &&
      rule.opensAt <= time &&
      time <= closingTime(rule.closesAt),
  );
}
