import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Receipt } from "lucide-react";
import NextLink from "next/link";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { EmptyState } from "@/components/ui/feedback";
import { PaymentList } from "@/components/features/booking/payment-list";
import { requireCustomer } from "@/server/auth/session";
import { customerPayments } from "@/server/account/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/payments">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "account.payments" });
  return { title: t("title"), robots: { index: false } };
}

/** Alle betalinger og refusioner med link til bookingen og kvitteringen. */
export default async function AccountPaymentsPage({
  params,
}: PageProps<"/[locale]/account/payments">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireCustomer(
    `${localizedPath(locale, "/login")}?next=${localizedPath(locale, "/account/payments")}`,
  );
  const [t, payments] = await Promise.all([
    getTranslations("account.payments"),
    customerPayments(user.userId),
  ]);
  const referenceOf = new Map(payments.map((payment) => [payment.id, payment.reference]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-900">{t("title")}</h1>
      {payments.length > 0 ? (
        <PaymentList payments={payments} locale={locale}>
          {(payment) => {
            const reference = referenceOf.get(payment.id)!;
            return (
              <span className="flex flex-wrap gap-x-4 text-sm">
                <NextLink
                  href={localizedPath(locale, `/account/bookings/${reference}`)}
                  className="font-medium text-brand-700 underline"
                >
                  {t("booking", { reference })}
                </NextLink>
                {payment.kind !== "REFUND" ? (
                  <NextLink
                    href={localizedPath(locale, `/booking/${reference}/receipt`)}
                    className="font-medium text-brand-700 underline"
                  >
                    {t("receipt")}
                  </NextLink>
                ) : null}
              </span>
            );
          }}
        </PaymentList>
      ) : (
        <EmptyState icon={<Receipt />} title={t("emptyTitle")} description={t("emptyBody")} />
      )}
    </div>
  );
}
