import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { directionOf, routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/features/layout/site-header";
import { SiteFooter } from "@/components/features/layout/site-footer";
import { WhatsAppFloatingButton } from "@/components/features/layout/whatsapp-floating-button";
import { CookieBanner } from "@/components/features/layout/cookie-banner";
import { consentPrecheckScript } from "@/lib/consent";
import { geistSans, plexArabic } from "../fonts";
import "../globals.css";

/** Kun de tekster, klient-komponenterne bruger, sendes med til browseren. */
const CLIENT_NAMESPACES = ["nav", "common", "whatsapp", "auth", "contact", "cookies", "language"];

function clientMessages(messages: Record<string, unknown>) {
  return Object.fromEntries(CLIENT_NAMESPACES.map((key) => [key, messages[key]]));
}

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
  const [t, messages] = await Promise.all([
    getTranslations({ locale, namespace: "nav" }),
    getMessages({ locale }),
  ]);

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      className={`${geistSans.variable} ${plexArabic.variable} h-full`}
      // consentPrecheckScript tilføjer evt. en klasse før hydrering.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: consentPrecheckScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider messages={clientMessages(messages)}>
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
