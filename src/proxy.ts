import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Alt undtagen API, admin, Next.js-interne stier og filer med endelse.
  matcher: "/((?!api|admin|_next|_vercel|.*\\..*).*)",
};
