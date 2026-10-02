/**
 * Tidszoner og lejedage. Tidspunkter gemmes i UTC; lejedage tælles i lokationens lokale tid,
 * så et sommertidsskift ikke ændrer prisen (en leje fra lørdag kl. 10 til søndag kl. 10 er
 * altid 1 dag, selv om natten kun har 23 eller 25 timer).
 */

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(timeZone, format);
  }
  return format;
}

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Vægur-tid i en tidszone, fx 2026-03-29 10:00 i Europe/Copenhagen. */
export function toLocal(instant: Date, timeZone: string): LocalDateTime {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

/** Lokal dato som "YYYY-MM-DD" (bruges til sæsonpriser). */
export function localDateKey(instant: Date, timeZone: string): string {
  const { year, month, day } = toLocal(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function wallClockMinutes(local: LocalDateTime): number {
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) / MINUTE;
}

/** Minutter mellem to tidspunkter målt på lokationens ur. */
export function localMinutesBetween(from: Date, to: Date, timeZone: string): number {
  return wallClockMinutes(toLocal(to, timeZone)) - wallClockMinutes(toLocal(from, timeZone));
}

/**
 * Antal lejedage: påbegyndte 24-timers blokke målt på det lokale ur, minimum 1.
 * De første `graceMinutes` af en ny blok er gratis (fx 59 min forsinkelse).
 */
export function rentalDays(
  pickupAt: Date,
  returnAt: Date,
  timeZone: string,
  graceMinutes: number,
): number {
  const minutes = localMinutesBetween(pickupAt, returnAt, timeZone);
  if (minutes <= 0) throw new RangeError("Afleveringen skal ligge efter afhentningen");
  const fullDays = Math.floor(minutes / DAY_MINUTES);
  const remainder = minutes % DAY_MINUTES;
  const days = remainder > graceMinutes ? fullDays + 1 : fullDays;
  return Math.max(1, days);
}
