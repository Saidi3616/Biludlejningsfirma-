import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { whatsappLink } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/booking">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "booking" });
  return { title: t("title"), robots: { index: false } };
}

// Midlertidig side. Bookingflowet med betaling bygges i M7.
export default async function BookingPage({ params }: PageProps<"/[locale]/booking">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <Container className="flex max-w-2xl flex-col items-start gap-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{t("booking.title")}</h1>
      <p className="text-lg text-ink-700">{t("booking.comingSoon")}</p>
      <Button asChild variant="whatsapp" size="lg">
        <a href={whatsappLink(t("whatsapp.prefill"))} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon />
          {t("booking.whatsapp")}
        </a>
      </Button>
    </Container>
  );
}
