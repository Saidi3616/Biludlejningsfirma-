import type { MetadataRoute } from "next";
import { localizedPath } from "@/i18n/paths";
import { locales } from "@/i18n/routing";
import { absoluteUrl, languageAlternates } from "@/lib/seo";
import { sitemapSlugs } from "@/server/catalog/service";

// Bygges ved hver forespørgsel, så nye biler og lokationer kommer med med det samme.
export const dynamic = "force-dynamic";

/** Offentlige sider uden login. Private sider (konto, booking, admin) er udeladt med vilje. */
const STATIC_PATHS = [
  "/",
  "/cars",
  "/pricing",
  "/locations",
  "/about",
  "/contact",
  "/faq",
  "/reviews",
  "/terms",
  "/privacy",
  "/cookies",
] as const;

/** Én adresse pr. sprog, hver med henvisning til de andre sprog (hreflang). */
function entries(path: `/${string}`, lastModified?: Date): MetadataRoute.Sitemap {
  const languages = languageAlternates(path);
  return locales.map((locale) => ({
    url: absoluteUrl(localizedPath(locale, path)),
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { cars, locations } = await sitemapSlugs();
  return [
    ...STATIC_PATHS.flatMap((path) => entries(path)),
    ...cars.flatMap((car) => entries(`/cars/${car.slug}`, car.updatedAt)),
    ...locations.flatMap((location) => entries(`/locations/${location.slug}`, location.updatedAt)),
  ];
}
