import { defineRouting } from "next-intl/routing";

export const locales = ["da", "en", "ar", "fr"] as const;
export type Locale = (typeof locales)[number];

/** Sprog der læses fra højre mod venstre. */
export const rtlLocales: readonly Locale[] = ["ar"];

export function directionOf(locale: Locale): "ltr" | "rtl" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}

// Dansk uden præfiks (/cars), øvrige sprog med præfiks (/en/cars). Se K11.
export const routing = defineRouting({
  locales,
  defaultLocale: "da",
  localePrefix: "as-needed",
});
