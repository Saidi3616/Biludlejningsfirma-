import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { privatePage } from "@/lib/seo";
import { Container } from "@/components/ui/layout";
import { AccountNav } from "@/components/features/account/account-nav";
import { LogoutButton } from "@/components/features/auth/logout-button";

export const metadata: Metadata = privatePage;

/** Fælles ramme for Min konto. Hver side tjekker selv login (requireCustomer). */
export default async function AccountLayout({
  children,
  params,
}: LayoutProps<"/[locale]/account">) {
  const { locale } = (await params) as { locale: Locale };
  const t = await getTranslations();
  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <p className="text-2xl font-semibold tracking-tight text-ink-900">{t("account.title")}</p>
        <LogoutButton label={t("auth.logout")} redirectTo={localizedPath(locale, "/")} />
      </div>
      <AccountNav />
      {children}
    </Container>
  );
}
