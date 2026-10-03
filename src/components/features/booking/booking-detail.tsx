import { getTranslations } from "next-intl/server";
import { FileSignature, FileText } from "lucide-react";
import NextLink from "next/link";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { cancellationPolicy } from "@/config/rental";
import { whatsappLink } from "@/config/site";
import { getSiteContact } from "@/server/settings";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { BookingItems } from "@/components/features/booking/booking-items";
import { CancelForm } from "@/components/features/booking/cancel-form";
import { PaymentList } from "@/components/features/booking/payment-list";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cancelBookingAction } from "@/app/[locale]/booking/[reference]/actions";
import type { CancellationTerms } from "@/server/booking/cancel";
import type { BookingSummary } from "@/server/booking/summary";

/**
 * Én booking set fra kunden: detaljer, betalinger, kvittering, WhatsApp og annullering.
 * Bruges både af /account/bookings/[reference] og gæstens /booking/[reference].
 */
export async function BookingDetail({
  booking,
  terms,
  locale,
  from,
  cancelled,
}: {
  booking: BookingSummary;
  terms: CancellationTerms;
  locale: Locale;
  from: "account" | "booking";
  /** Kunden har netop annulleret (vis kvittering øverst). */
  cancelled: boolean;
}) {
  const [t, contact] = await Promise.all([getTranslations("manage"), getSiteContact()]);
  const money = (amount: number) => formatMoney(amount, booking.currency, locale);
  const { reference } = booking;
  const refunded = booking.payments
    .filter((payment) => payment.kind === "REFUND")
    .reduce((sum, payment) => sum + payment.amountMinor, 0);
  const paid = booking.payments.some((payment) => payment.kind !== "REFUND");
  const upcoming = ["CONFIRMED", "ACTIVE"].includes(booking.status);
  const pickupZone = booking.pickupLocation.timezone;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {t("title", { reference })}
          </h1>
          <div className="flex flex-wrap gap-2">
            <StatusBadge kind="booking" status={booking.status} />
            <StatusBadge kind="payment" status={booking.paymentStatus} />
          </div>
        </header>

        {cancelled && booking.status === "CANCELLED" ? (
          <Alert tone="success" title={t("cancelledTitle")}>
            {refunded > 0
              ? t("cancelledRefund", { amount: money(refunded) })
              : t("cancelledNoRefund")}
          </Alert>
        ) : null}

        {booking.status === "PENDING_PAYMENT" ? (
          <Alert tone="warning">
            {t("pendingPayment")}{" "}
            <NextLink
              href={localizedPath(locale, `/booking/pay/${reference}`)}
              className="font-medium underline"
            >
              {t("payNow")}
            </NextLink>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button asChild variant="whatsapp">
            <a
              href={whatsappLink(contact.whatsappNumber, t("whatsappPrefill", { reference }))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              {t("whatsapp")}
            </a>
          </Button>
          {paid ? (
            <Button asChild variant="secondary">
              <NextLink href={localizedPath(locale, `/booking/${reference}/receipt`)}>
                <FileText aria-hidden />
                {t("receipt")}
              </NextLink>
            </Button>
          ) : null}
          {booking.contractSigned ? (
            <Button asChild variant="secondary">
              <a href={localizedPath(locale, `/booking/${reference}/contract`)} target="_blank">
                <FileSignature aria-hidden />
                {t("contract")}
              </a>
            </Button>
          ) : null}
        </div>

        {booking.payments.length > 0 ? (
          <section aria-labelledby="payments" className="flex flex-col gap-3">
            <h2 id="payments" className="text-xl font-semibold text-ink-900">
              {t("paymentsTitle")}
            </h2>
            <PaymentList payments={booking.payments} locale={locale} />
          </section>
        ) : null}

        {upcoming ? (
          <section aria-labelledby="change" className="flex flex-col gap-2">
            <h2 id="change" className="text-xl font-semibold text-ink-900">
              {t("changeTitle")}
            </h2>
            <p className="text-base text-ink-700">{t("changeBody")}</p>
          </section>
        ) : null}

        {terms.allowed ? (
          <section
            aria-labelledby="cancel"
            className="flex flex-col gap-4 rounded-xl border border-border p-5"
          >
            <h2 id="cancel" className="text-xl font-semibold text-ink-900">
              {t("cancel.title")}
            </h2>
            <p className="text-base text-ink-700">
              {terms.free
                ? t("cancel.free", {
                    deadline: formatDateTime(terms.freeUntil, locale, pickupZone),
                    amount: money(terms.refundMinor),
                  })
                : t("cancel.late", {
                    hours: cancellationPolicy.freeUntilHoursBefore,
                    percent: cancellationPolicy.lateRefundPercent,
                    amount: money(terms.refundMinor),
                  })}
            </p>
            <CancelForm
              action={cancelBookingAction}
              reference={reference}
              locale={locale}
              from={from}
            />
          </section>
        ) : null}
      </div>

      <Card className="self-start">
        <CardBody className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink-900">{t("summaryTitle")}</h2>
          <BookingItems booking={booking} locale={locale} />
        </CardBody>
      </Card>
    </div>
  );
}
