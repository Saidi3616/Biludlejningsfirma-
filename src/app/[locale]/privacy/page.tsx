import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { TextPage } from "@/components/features/content/text-page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "privacy" });
  return { title: t("title"), description: t("description") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <TextPage
      title={t("privacy.title")}
      description={t("privacy.description")}
      sections={t.raw("privacy.sections") as { title: string; body: string }[]}
      notice={t("legal.draftNotice")}
    />
  );
}
