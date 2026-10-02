import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FileSignature } from "lucide-react";
import NextLink from "next/link";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatDate } from "@/lib/format";
import { requireCustomer } from "@/server/auth/session";
import { customerContracts } from "@/server/account/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/documents">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "account.documents" });
  return { title: t("title"), robots: { index: false } };
}

/** Kundens dokumenter: underskrevne lejekontrakter som PDF. Kørekort-upload kommer senere. */
export default async function AccountDocumentsPage({
  params,
}: PageProps<"/[locale]/account/documents">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireCustomer(
    `${localizedPath(locale, "/login")}?next=${localizedPath(locale, "/account/documents")}`,
  );
  const [t, contracts] = await Promise.all([
    getTranslations("account.documents"),
    customerContracts(user.userId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-900">{t("title")}</h1>
      {contracts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {contracts.map((contract) => (
            <li key={contract.reference}>
              <Card>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="font-medium text-ink-900">
                      {t("contract", { reference: contract.reference })}
                    </span>
                    <span className="text-sm text-muted">
                      {t("meta", {
                        car: contract.car,
                        date: formatDate(contract.signedAt, locale, contract.timeZone),
                      })}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-4 text-sm">
                    <NextLink
                      href={localizedPath(locale, `/account/bookings/${contract.reference}`)}
                      className="font-medium text-brand-700 underline"
                    >
                      {t("booking")}
                    </NextLink>
                    <a
                      href={localizedPath(locale, `/booking/${contract.reference}/contract`)}
                      target="_blank"
                      className="font-medium text-brand-700 underline"
                    >
                      {t("download")}
                    </a>
                  </span>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<FileSignature />} title={t("emptyTitle")} description={t("emptyBody")} />
      )}
    </div>
  );
}
