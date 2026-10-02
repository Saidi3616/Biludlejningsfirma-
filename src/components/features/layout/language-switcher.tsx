"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("label")}</span>
      <Globe className="pointer-events-none absolute start-2.5 size-4 text-ink-600" aria-hidden />
      <select
        value={locale}
        onChange={(event) => router.replace(pathname, { locale: event.target.value as Locale })}
        className="h-10 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent ps-8 pe-3 text-sm font-medium text-ink-800 hover:border-ink-200 hover:bg-ink-50"
      >
        {routing.locales.map((code) => (
          <option key={code} value={code} lang={code}>
            {t(code)}
          </option>
        ))}
      </select>
    </label>
  );
}
