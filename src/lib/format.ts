/**
 * Formattering af penge og datoer efter sprog. Beløb kommer altid som
 * heltal i mindste enhed (øre/cent) fra serveren og regnes aldrig om her.
 */
const intlLocale: Record<string, string> = {
  da: "da-DK",
  en: "en-GB",
  ar: "ar-MA",
  fr: "fr-FR",
};

export function formatMoney(amountMinor: number, currency: string, locale: string): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error("formatMoney forventer et heltal i mindste enhed");
  }
  const amount = amountMinor / 100;
  return new Intl.NumberFormat(intlLocale[locale] ?? locale, {
    style: "currency",
    currency,
    // Hele beløb vises uden decimaler (399 kr.), ellers med to.
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
    // Vestlige cifre også på arabisk, så priser er entydige.
    numberingSystem: "latn",
  }).format(amount);
}

/** Dato og klokkeslæt i lokationens tidszone, fx "man. 1. jun. 10.00". */
export function formatDateTime(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale[locale] ?? locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(instant);
}

/** Dato med år og klokkeslæt, fx "2. okt. 2026 14.30" (kontrakter). */
export function formatDateTimeFull(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale[locale] ?? locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(instant);
}

/** Dato med år, fx "2. okt. 2026" (kvitteringer og betalinger). */
export function formatDate(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale[locale] ?? locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
  }).format(instant);
}

/** Ugedagens navn (1 = mandag … 7 = søndag) på sproget. */
export function weekdayName(weekday: number, locale: string): string {
  // 5. januar 2026 er en mandag.
  return new Intl.DateTimeFormat(intlLocale[locale] ?? locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 4 + weekday)));
}

/** Øre som kroner til et inputfelt, fx 45000 → "450,00". Læses igen af `parseKroner`. */
export function minorToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
}
