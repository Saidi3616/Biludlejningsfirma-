import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { findBookingByManageToken, grantBookingAccess } from "@/server/booking/access";

/**
 * Linket i gæstens e-mails (K7). Et gyldigt token giver adgang i denne browser (httpOnly-cookie)
 * og sender videre til bookingen, så tokenet ikke bliver stående i adresselinjen.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/[locale]/booking/manage/[token]">,
) {
  const { locale: rawLocale, token } = await params;
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const reference = await findBookingByManageToken(token);
  const target = reference
    ? localizedPath(locale, `/booking/${reference}`)
    : localizedPath(locale, "/booking/link-invalid");
  if (reference) await grantBookingAccess(reference, token);
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
