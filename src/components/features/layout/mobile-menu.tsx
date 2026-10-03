"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { whatsappLink } from "@/config/site";
import { WhatsAppIcon } from "./whatsapp-icon";
import { LanguageSwitcher } from "./language-switcher";
import { mainNav } from "./nav-links";

export function MobileMenu({ whatsappNumber }: { whatsappNumber: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("nav.openMenu")} className="lg:hidden">
          <Menu className="size-6" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent variant="sheet" title={t("nav.menu")} closeLabel={t("common.close")}>
        <nav aria-label={t("nav.main")}>
          <ul className="flex flex-col">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-border text-lg font-medium text-ink-900"
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-3">
          <Button asChild variant="secondary" size="lg" fullWidth>
            <Link href="/account" onClick={() => setOpen(false)}>
              <UserRound className="size-5" aria-hidden />
              {t("nav.account")}
            </Link>
          </Button>
          <Button asChild variant="whatsapp" size="lg" fullWidth>
            <a
              href={whatsappLink(whatsappNumber, t("whatsapp.prefill"))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              {t("whatsapp.floating")}
            </a>
          </Button>
          <LanguageSwitcher />
        </div>
      </DialogContent>
    </Dialog>
  );
}
