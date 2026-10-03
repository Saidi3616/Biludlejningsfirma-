import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { TextPage } from "@/components/features/content/text-page";
import { CookieSettingsButton } from "@/components/features/layout/cookie-banner";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/cookies">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "cookiePolicy" });
  return pageMetadata(locale as Locale, "/cookies", {
    title: t("title"),
    description: t("description"),
  });
}

export default async function CookiesPage({ params }: PageProps<"/[locale]/cookies">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <TextPage
      title={t("cookiePolicy.title")}
      description={t("cookiePolicy.description")}
      sections={t.raw("cookiePolicy.sections") as { title: string; body: string }[]}
      notice={t("legal.draftNotice")}
    >
      <p className="flex flex-wrap items-center gap-2 text-base text-ink-700">
        {t("cookiePolicy.change")} <CookieSettingsButton label={t("footer.cookieSettings")} />
      </p>
    </TextPage>
  );
}
