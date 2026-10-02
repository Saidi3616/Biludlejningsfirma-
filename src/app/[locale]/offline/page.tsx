import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WifiOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { privatePage } from "@/lib/seo";
import { Button } from "@/components/ui/button";

/** Vises af service workeren, når en side ikke kan hentes uden net (public/sw.js). */
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/offline">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "offline" });
  return { title: t("title"), ...privatePage };
}

export default async function OfflinePage({ params }: PageProps<"/[locale]/offline">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("offline");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <WifiOff className="size-10 text-ink-500" aria-hidden />
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <p className="max-w-md text-lg text-muted">{t("body")}</p>
      <Button asChild>
        <Link href="/">{t("retry")}</Link>
      </Button>
    </div>
  );
}
