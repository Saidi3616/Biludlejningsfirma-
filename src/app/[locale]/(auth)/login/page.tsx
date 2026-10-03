import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localizedPath, safeRedirectPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/server/auth/session";
import { AuthPage } from "@/components/features/auth/auth-page";
import { LoginForm } from "@/components/features/auth/login-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.login" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const next = safeRedirectPath((await searchParams).next);

  if (await getCurrentUser()) redirect(next ?? localizedPath(locale, "/account"));

  const t = await getTranslations("auth.login");
  return (
    <AuthPage title={t("title")} intro={t("intro")}>
      <LoginForm next={next} />
    </AuthPage>
  );
}
