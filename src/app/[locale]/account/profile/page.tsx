import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { ProfileForm } from "@/components/features/account/profile-form";
import { requireCustomer } from "@/server/auth/session";
import { customerProfile } from "@/server/account/service";
import { updateProfileAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/profile">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "account.profile" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountProfilePage({
  params,
}: PageProps<"/[locale]/account/profile">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireCustomer(
    `${localizedPath(locale, "/login")}?next=${localizedPath(locale, "/account/profile")}`,
  );
  const [t, profile] = await Promise.all([
    getTranslations("account.profile"),
    customerProfile(user),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-900">{t("title")}</h1>
      <p className="max-w-xl text-base text-ink-700">{t("intro")}</p>
      <ProfileForm action={updateProfileAction} email={user.email} initial={profile} />
    </div>
  );
}
