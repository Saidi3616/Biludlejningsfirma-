import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/server/auth/session";
import { Container } from "@/components/ui/layout";
import { LogoutButton } from "@/components/features/auth/logout-button";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

// Midlertidig kontoside. Bookinger, betalinger og dokumenter kommer i M9.
export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireCustomer(
    `${localizedPath(locale, "/login")}?next=${localizedPath(locale, "/account")}`,
  );
  const t = await getTranslations();

  return (
    <Container className="flex flex-1 flex-col gap-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{t("account.title")}</h1>
        <LogoutButton label={t("auth.logout")} redirectTo={localizedPath(locale, "/")} />
      </div>
      <p className="text-muted">
        {t("account.signedInAs", { name: user.name, email: user.email })}
      </p>
      <p className="text-ink-700">{t("account.comingSoon")}</p>
    </Container>
  );
}
