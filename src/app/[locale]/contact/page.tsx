import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Mail, Phone } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { site, whatsappLink } from "@/config/site";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { ContactForm } from "@/components/features/contact/contact-form";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";
import { sendContactMessage } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "contact" });
  return pageMetadata(locale as Locale, "/contact", {
    title: t("title"),
    description: t("description"),
  });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  const channels = [
    {
      icon: Phone,
      label: t("contact.phone"),
      value: site.phone,
      href: `tel:${site.phone.replace(/\s/g, "")}`,
      ltr: true,
    },
    { icon: Mail, label: t("contact.email"), value: site.email, href: `mailto:${site.email}` },
  ];

  return (
    <Container className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {t("contact.title")}
          </h1>
          <p className="text-lg text-muted">{t("contact.description")}</p>
        </header>
        <ul className="flex flex-col gap-4">
          {channels.map(({ icon: Icon, label, value, href, ltr }) => (
            <li key={label} className="flex items-start gap-3">
              <Icon className="mt-1 size-5 text-ink-500" aria-hidden />
              <div className="flex flex-col">
                <span className="text-sm text-muted">{label}</span>
                <a
                  href={href}
                  className="text-base font-medium text-ink-900 hover:underline"
                  dir={ltr ? "ltr" : undefined}
                >
                  {value}
                </a>
              </div>
            </li>
          ))}
          <li className="flex items-start gap-3">
            <WhatsAppIcon className="mt-1 size-5 text-ink-500" />
            <div className="flex flex-col">
              <span className="text-sm text-muted">{t("contact.whatsapp")}</span>
              <a
                href={whatsappLink(t("whatsapp.prefill"))}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-ink-900 hover:underline"
              >
                {t("whatsapp.floating")}
              </a>
            </div>
          </li>
        </ul>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-ink-900">{t("contact.formTitle")}</h2>
          <ContactForm action={sendContactMessage} />
        </CardBody>
      </Card>
    </Container>
  );
}
