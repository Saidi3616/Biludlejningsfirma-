import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { site } from "@/config/site";
import { can } from "@/server/auth/policies";
import { requireStaff } from "@/server/auth/session";
import { AdminNav } from "@/components/features/admin/admin-nav";
import { LogoutButton } from "@/components/features/auth/logout-button";
import { geistSans, plexArabic } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Administration", template: `%s · Admin · ${site.name}` },
  robots: { index: false, follow: false },
};

/**
 * Admin har sit eget layout uden for sprog-routingen og er på dansk (04-sitemap).
 * Layoutet tjekker login; hver side tjekker selv sin adgang, fordi layouts ikke
 * genindlæses ved navigation.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  setRequestLocale("da");
  const user = await requireStaff({ allowMissingTwoFactor: true });
  const t = await getTranslations("admin");
  const nav = [
    { href: "/admin", label: t("nav.dashboard") },
    { href: "/admin/calendar", label: t("nav.calendar") },
    { href: "/admin/bookings", label: t("nav.bookings") },
    { href: "/admin/customers", label: t("nav.customers") },
    { href: "/admin/fleet", label: t("nav.fleet") },
    ...(can({ actor: user }, "catalog:write")
      ? [
          {
            href: "/admin/pricing",
            label: t("nav.pricing"),
            also: ["/admin/extras", "/admin/discounts", "/admin/locations"],
          },
        ]
      : []),
    ...(can({ actor: user }, "users:manage")
      ? [{ href: "/admin/users", label: t("nav.users") }]
      : []),
    { href: "/admin/security", label: t("nav.security") },
  ];

  return (
    <html lang="da" dir="ltr" className={`${geistSans.variable} ${plexArabic.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-surface">
        <NextIntlClientProvider>
          <a
            href="#content"
            className="sr-only z-[60] rounded-md bg-brand-700 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
          >
            {t("skipToContent")}
          </a>
          <header className="border-b border-border bg-white">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
                <span className="font-semibold text-ink-900">
                  {site.name} · {t("title")}
                </span>
                <AdminNav label={t("nav.label")} items={nav} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted">{t("signedInAs", { email: user.email })}</span>
                <Link href="/" className="text-sm font-medium text-brand-700 underline">
                  {t("toSite")}
                </Link>
                <LogoutButton
                  label={(await getTranslations("auth"))("logout")}
                  redirectTo="/login"
                />
              </div>
            </div>
          </header>
          <main
            id="content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 focus:outline-none sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
