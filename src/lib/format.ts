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
