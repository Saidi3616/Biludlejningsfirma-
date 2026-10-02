import type { MetadataRoute } from "next";
import { locales, routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Sider bag login eller personlige links; de har også noindex. */
const PRIVATE_PATHS = ["/account", "/booking", "/reviews/new", "/login", "/register", "/offline"];

export default function robots(): MetadataRoute.Robots {
  // Kun production må indekseres; staging og previews skal ikke i søgeresultater.
  if (process.env.APP_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  const prefixes = locales.map((locale) => (locale === routing.defaultLocale ? "" : `/${locale}`));
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        ...prefixes.flatMap((prefix) => PRIVATE_PATHS.map((path) => `${prefix}${path}`)),
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
