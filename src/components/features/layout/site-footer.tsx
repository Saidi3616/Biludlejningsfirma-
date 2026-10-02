import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/layout";
import { site, whatsappLink } from "@/config/site";
import { CookieSettingsButton } from "./cookie-banner";

export function SiteFooter() {
  const t = useTranslations();

  const columns = [
    {
      title: t("footer.company"),
      links: [
        { href: "/about", label: t("nav.about") },
        { href: "/locations", label: t("nav.locations") },
        { href: "/reviews", label: t("footer.reviews") },
      ],
    },
    {
      title: t("footer.help"),
      links: [
        { href: "/contact", label: t("nav.contact") },
        { href: "/faq", label: t("nav.faq") },
        { href: "/pricing", label: t("nav.pricing") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/terms", label: t("footer.terms") },
        { href: "/privacy", label: t("footer.privacy") },
        { href: "/cookies", label: t("footer.cookies") },
      ],
    },
  ];

  return (
    // Ekstra bundafstand på mobil, så den flydende WhatsApp-knap ikke dækker indhold.
    <footer className="mt-auto border-t border-border bg-ink-50 pb-24 lg:pb-0 print:hidden">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <p className="text-lg font-bold text-ink-900">{site.name}</p>
          <p className="text-base text-muted">{t("footer.tagline")}</p>
          <ul className="flex flex-col gap-1 text-base text-ink-700">
            <li>
              <a
                href={`tel:${site.phone.replace(/\s/g, "")}`}
                className="hover:underline"
                dir="ltr"
              >
                {site.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${site.email}`} className="hover:underline">
                {site.email}
              </a>
            </li>
            <li>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {t("whatsapp.cta")}
              </a>
            </li>
          </ul>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <p className="font-semibold text-ink-900">{column.title}</p>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-base text-ink-700 hover:text-ink-900 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              {column.title === t("footer.legal") ? (
                <li>
                  <CookieSettingsButton label={t("footer.cookieSettings")} />
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </Container>
      <Container className="border-t border-border py-6 text-sm text-muted">
        {t("footer.rights", { year: new Date().getFullYear(), name: site.name })}
      </Container>
    </footer>
  );
}
