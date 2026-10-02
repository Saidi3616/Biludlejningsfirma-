import type { Metadata } from "next";
import { Geist, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { directionOf, routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/features/layout/site-header";
import { SiteFooter } from "@/components/features/layout/site-footer";
import { WhatsAppFloatingButton } from "@/components/features/layout/whatsapp-floating-button";
import { CookieBanner } from "@/components/features/layout/cookie-banner";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as never, namespace: "meta" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "nav" });

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      className={`${geistSans.variable} ${plexArabic.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <a
            href="#content"
            className="sr-only z-[60] rounded-md bg-brand-700 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
          >
            {t("skipToContent")}
          </a>
          <SiteHeader />
          <main id="content" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
            {children}
          </main>
          <SiteFooter />
          <WhatsAppFloatingButton />
          <CookieBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
