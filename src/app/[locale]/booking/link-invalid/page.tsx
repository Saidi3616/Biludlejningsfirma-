import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { whatsappLink } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/booking/link-invalid">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "manage.linkInvalid" });
  return { title: t("title"), robots: { index: false } };
}

/** Et "administrér booking"-link, der ikke (længere) virker. */
export default async function LinkInvalidPage({
  params,
}: PageProps<"/[locale]/booking/link-invalid">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("manage.linkInvalid");
  return (
    <Container className="flex max-w-2xl flex-col items-start gap-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <p className="text-lg text-ink-700">{t("body")}</p>
      <Button asChild variant="whatsapp">
        <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon />
          {t("whatsapp")}
        </a>
      </Button>
    </Container>
  );
}
