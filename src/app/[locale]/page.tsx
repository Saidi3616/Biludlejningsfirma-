import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import type { Locale } from "@/i18n/routing";

// Midlertidig forside. Den rigtige forside med booking-widget bygges i M6.
export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale as Locale);
  const t = useTranslations("home");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="max-w-3xl text-(length:--text-display) leading-(--text-display--line-height) font-semibold tracking-(--text-display--letter-spacing) text-ink-900">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-md text-lg text-muted">{t("subtitle")}</p>
    </div>
  );
}
