import type { Metadata } from "next";
import { site } from "@/config/site";
import { localizedPath } from "@/i18n/paths";
import { locales, routing, type Locale } from "@/i18n/routing";

/**
 * Søgemaskine-metadata (M16): fuld adresse, canonical og hreflang for hver offentlig side.
 * Sitets adresse er den samme som til links i e-mails (AUTH_URL).
 */
export function siteUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl()}/`).toString();
}

/** Open Graph bruger sprog med region (da_DK); vi har ét marked pr. sprog. */
const ogLocales: Record<Locale, string> = { da: "da_DK", en: "en_GB", ar: "ar_AR", fr: "fr_FR" };

/** Samme side på alle sprog, plus x-default (dansk), til hreflang og sitemap. */
export function languageAlternates(path: `/${string}`): Record<string, string> {
  const entries: [string, string][] = locales.map((locale) => [
    locale,
    absoluteUrl(localizedPath(locale, path)),
  ]);
  entries.push(["x-default", absoluteUrl(localizedPath(routing.defaultLocale, path))]);
  return Object.fromEntries(entries);
}

type PageSeo = {
  /** `{ absolute }` uden sitets navn bagefter (forsiden). */
  title?: string | { absolute: string };
  description?: string;
  /** Delingsbillede; uden et bruges sitets standardbillede. */
  image?: { url: string; alt: string } | null;
};

/** Metadata til en offentlig side: titel, beskrivelse, canonical, hreflang og Open Graph. */
export function pageMetadata(locale: Locale, path: `/${string}`, seo: PageSeo = {}): Metadata {
  const url = absoluteUrl(localizedPath(locale, path));
  return {
    ...(seo.title ? { title: seo.title } : {}),
    ...(seo.description ? { description: seo.description } : {}),
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      url,
      siteName: site.name,
      ...(seo.title ? { title: seo.title } : {}),
      ...(seo.description ? { description: seo.description } : {}),
      locale: ogLocales[locale],
      alternateLocale: locales.filter((other) => other !== locale).map((other) => ogLocales[other]),
      images: [
        seo.image
          ? { url: seo.image.url, alt: seo.image.alt }
          : {
              // Standardbilledet fra [locale]/opengraph-image.tsx.
              url: localizedPath(locale, "/opengraph-image"),
              width: 1200,
              height: 630,
              alt: site.name,
            },
      ],
    },
  };
}

/** Sider, der kræver login eller et personligt link, skal ikke i søgeresultater. */
export const privatePage: Metadata = { robots: { index: false, follow: false } };

/** Beløb i mindste enhed som decimaltal til schema.org ("1234.50"), uden flydende tal. */
export function schemaPrice(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("beløb skal være et heltal");
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** JSON-LD til et <script>-tag. "<" escapes, så tekst fra databasen aldrig kan lukke tagget. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}
