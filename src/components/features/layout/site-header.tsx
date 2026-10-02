import { useTranslations } from "next-intl";
import { Car, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { site, whatsappLink } from "@/config/site";
import { LanguageSwitcher } from "./language-switcher";
import { MobileMenu } from "./mobile-menu";
import { WhatsAppIcon } from "./whatsapp-icon";
import { mainNav } from "./nav-links";

export function SiteHeader() {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 print:hidden">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-ink-900">
          <span className="flex size-8 items-center justify-center rounded-md bg-brand-700 text-white">
            <Car className="size-5" aria-hidden />
          </span>
          {site.name}
        </Link>

        <nav aria-label={t("nav.main")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-md px-3 py-2 text-base font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900"
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden lg:inline-flex" />
          <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
            <Link href="/account">
              <UserRound className="size-4" aria-hidden />
              {t("nav.account")}
            </Link>
          </Button>
          <Button asChild variant="whatsapp" size="sm" className="hidden lg:inline-flex">
            <a href={whatsappLink(t("whatsapp.prefill"))} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon />
              {t("whatsapp.cta")}
            </a>
          </Button>
          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}
