import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { TextPage } from "@/components/features/content/text-page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "terms" });
  return pageMetadata(locale as Locale, "/terms", {
    title: t("title"),
    description: t("description"),
  });
}

export default async function TermsPage({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <TextPage
      title={t("terms.title")}
      description={t("terms.description")}
      sections={t.raw("terms.sections") as { title: string; body: string }[]}
      notice={t("legal.draftNotice")}
    />
  );
}
