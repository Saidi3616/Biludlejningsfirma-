import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { TextPage } from "@/components/features/content/text-page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "about" });
  return pageMetadata(locale as Locale, "/about", {
    title: t("title"),
    description: t("description"),
  });
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <TextPage
      title={t("about.title")}
      description={t("about.description")}
      sections={t.raw("about.sections") as { title: string; body: string }[]}
    />
  );
}
