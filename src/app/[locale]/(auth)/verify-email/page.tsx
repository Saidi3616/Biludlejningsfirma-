import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthPage } from "@/components/features/auth/auth-page";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/verify-email">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.verify" });
  return { title: t("successTitle"), robots: { index: false } };
}

/** Better Auth sender hertil efter klik på linket i e-mailen, med `?error=...` ved fejl. */
export default async function VerifyEmailPage({
  params,
  searchParams,
}: PageProps<"/[locale]/verify-email">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { error } = await searchParams;
  const t = await getTranslations("auth.verify");

  if (error) {
    return (
      <AuthPage title={t("errorTitle")}>
        <div className="flex flex-col gap-4">
          <Alert tone="warning">{t("errorBody")}</Alert>
          <Button asChild fullWidth>
            <Link href="/login">{t("login")}</Link>
          </Button>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage title={t("successTitle")}>
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t("successBody")}</Alert>
        <Button asChild fullWidth>
          <Link href="/account">{t("continue")}</Link>
        </Button>
      </div>
    </AuthPage>
  );
}
