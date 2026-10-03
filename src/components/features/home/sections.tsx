import { useTranslations } from "next-intl";
import { BadgeCheck, Clock, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import { whatsappLink } from "@/config/site";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";

const whyIcons = [BadgeCheck, Sparkles, Clock, MessageCircle];

export function WhyUs() {
  const t = useTranslations("home.why");
  const items = t.raw("items") as { title: string; body: string }[];
  return (
    <Section title={t("title")} className="bg-ink-50">
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => {
          const Icon = whyIcons[index] ?? BadgeCheck;
          return (
            <li key={item.title} className="flex flex-col gap-3">
              <span className="flex size-11 items-center justify-center rounded-md bg-brand-700 text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="text-lg font-semibold text-ink-900">{item.title}</h3>
              <p className="text-base text-ink-700">{item.body}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function HowItWorks() {
  const t = useTranslations("home.how");
  const steps = t.raw("steps") as { title: string; body: string }[];
  return (
    <Section title={t("title")}>
      <ol className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3">
            <span
              aria-hidden
              className="flex size-11 items-center justify-center rounded-full border-2 border-brand-700 text-lg font-bold text-brand-700"
            >
              {index + 1}
            </span>
            <h3 className="text-lg font-semibold text-ink-900">{step.title}</h3>
            <p className="text-base text-ink-700">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function WhatsAppCta() {
  const t = useTranslations();
  return (
    <section className="bg-brand-800 py-12 text-white sm:py-16">
      <Container className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("home.whatsappCta.title")}</h2>
          <p className="text-lg text-brand-100">{t("home.whatsappCta.body")}</p>
        </div>
        <Button asChild variant="whatsapp" size="lg">
          <a href={whatsappLink(t("whatsapp.prefill"))} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon />
            {t("home.whatsappCta.button")}
          </a>
        </Button>
      </Container>
    </section>
  );
}
