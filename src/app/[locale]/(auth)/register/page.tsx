import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AuthPage } from "@/components/features/auth/auth-page";
import { RegisterForm } from "@/components/features/auth/register-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/register">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.register" });
  return { title: t("title"), robots: { index: false } };
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("auth.register");
  return (
    <AuthPage title={t("title")} intro={t("intro")}>
      <RegisterForm />
    </AuthPage>
  );
}
