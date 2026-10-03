/** Tekst gemt pr. sprog i databasen, fx `nameI18n`. Falder tilbage til dansk og derefter første værdi. */
export function localized(value: unknown, locale: string): string {
  if (!value || typeof value !== "object") return "";
  const texts = value as Record<string, unknown>;
  const text = texts[locale] ?? texts.da ?? Object.values(texts)[0];
  return typeof text === "string" ? text : "";
}
