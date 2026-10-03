import { routing, type Locale } from "./routing";

/** Sti med sprogpræfiks efter reglen "as-needed": dansk uden præfiks, øvrige med (/en/login). */
export function localizedPath(locale: Locale, path: `/${string}`): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path === "/" ? "" : path}`;
}

/** Kun relative stier på samme site må bruges som redirect-mål efter login (ingen open redirect). */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\r\n]/.test(value)) return null;
  return value;
}
