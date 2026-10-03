import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { PrivacyCenter } from "@/components/features/account/privacy-center";
import { requireCustomer } from "@/server/auth/session";
import { accountConsents } from "@/server/gdpr/consent";
import { anonymizeBlocker } from "@/server/gdpr/service";
import { db } from "@/server/db";
import { deleteAccountAction, saveConsentsAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "account.privacy" });
  return { title: t("title"), robots: { index: false } };
}

/** Samtykker, dataeksport og sletning af kontoen (04-sitemap, M15). */
export default async function AccountPrivacyPage({
  params,
}: PageProps<"/[locale]/account/privacy">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireCustomer(
    `${localizedPath(locale, "/login")}?next=${localizedPath(locale, "/account/privacy")}`,
  );
  const customer = await db.customer.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  const [t, consents, blocker] = await Promise.all([
    getTranslations("account.privacy"),
    accountConsents(user.userId),
    customer ? anonymizeBlocker(customer.id) : null,
  ]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-900">{t("title")}</h1>
      <p className="max-w-xl text-base text-ink-700">{t("intro")}</p>
      <PrivacyCenter
        consents={{ marketing: consents.marketing, whatsapp: consents.whatsapp }}
        blocker={blocker}
        homeHref={localizedPath(locale, "/")}
        saveConsents={saveConsentsAction}
        deleteAccount={deleteAccountAction}
      />
    </div>
  );
}
