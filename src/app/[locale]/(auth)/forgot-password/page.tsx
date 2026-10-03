import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AuthPage } from "@/components/features/auth/auth-page";
import { ForgotPasswordForm } from "@/components/features/auth/forgot-password-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.forgot" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ForgotPasswordPage({
  params,
}: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("auth.forgot");
  return (
    <AuthPage title={t("title")} intro={t("intro")}>
      <ForgotPasswordForm />
    </AuthPage>
  );
}
