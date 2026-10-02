import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AuthPage } from "@/components/features/auth/auth-page";
import { ResetPasswordForm } from "@/components/features/auth/reset-password-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reset-password/[token]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.reset" });
  // Tokenet står i URL'en: ingen indeksering og ingen referrer til andre sites.
  return { title: t("title"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({
  params,
}: PageProps<"/[locale]/reset-password/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("auth.reset");
  return (
    <AuthPage title={t("title")} intro={t("intro")}>
      <ResetPasswordForm token={token} />
    </AuthPage>
  );
}
