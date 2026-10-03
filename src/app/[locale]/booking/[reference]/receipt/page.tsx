import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { rentalRules } from "@/config/rental";
import { site } from "@/config/site";
import { getSiteContact } from "@/server/settings";
import { Container } from "@/components/ui/layout";
import { Price } from "@/components/ui/price";
import { BookingItems } from "@/components/features/booking/booking-items";
import { PaymentList } from "@/components/features/booking/payment-list";
import { PrintButton } from "@/components/features/booking/print-button";
import { formatDate } from "@/lib/format";
import { findAccessibleBooking } from "@/server/booking/access";
import { bookingSummary } from "@/server/booking/summary";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/booking/[reference]/receipt">): Promise<Metadata> {
  const { locale, reference } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "receipt" });
  return { title: t("title", { reference }), robots: { index: false } };
}

/** Kvittering, der kan printes eller gemmes som PDF fra browseren. Kun for betalte bookinger. */
export default async function ReceiptPage({
  params,
}: PageProps<"/[locale]/booking/[reference]/receipt">) {
  const { locale, reference } = (await params) as { locale: Locale; reference: string };
  setRequestLocale(locale);
  const bookingId = await findAccessibleBooking(reference);
  if (!bookingId) notFound();
  const booking = await bookingSummary(bookingId);
  const charges = booking.payments.filter((payment) => payment.kind !== "REFUND");
  if (charges.length === 0) notFound();

  const [t, contact] = await Promise.all([getTranslations("receipt"), getSiteContact()]);
  const paidAt = charges[charges.length - 1]!.createdAt;
  // Alle priser er inkl. moms; momsen udregnes af totalen.
  const vatMinor =
    booking.totalMinor -
    Math.round((booking.totalMinor * 100) / (100 + rentalRules.vatRatePercent));

  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10 print:py-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {t("title", { reference })}
          </h1>
          <p className="text-base text-muted">
            {t("date", { date: formatDate(paidAt, locale, booking.pickupLocation.timezone) })}
          </p>
        </div>
        <PrintButton label={t("print")} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section aria-labelledby="seller" className="flex flex-col gap-1 text-base text-ink-700">
          <h2 id="seller" className="font-semibold text-ink-900">
            {t("seller")}
          </h2>
          <p>{site.name}</p>
          {contact.address ? <p>{contact.address}</p> : null}
          <p>{contact.email}</p>
          <p>{contact.phone}</p>
        </section>
        <section aria-labelledby="buyer" className="flex flex-col gap-1 text-base text-ink-700">
          <h2 id="buyer" className="font-semibold text-ink-900">
            {t("customer")}
          </h2>
          <p>
            {booking.customer.firstName} {booking.customer.lastName}
          </p>
          <p>{booking.customer.email}</p>
        </section>
      </div>

      <section aria-labelledby="lines" className="flex flex-col gap-4">
        <h2 id="lines" className="text-xl font-semibold text-ink-900">
          {t("lines")}
        </h2>
        <BookingItems booking={booking} locale={locale} />
        <p className="flex justify-between gap-4 text-base text-ink-700">
          <span>{t("vat", { percent: rentalRules.vatRatePercent })}</span>
          <Price amountMinor={vatMinor} currency={booking.currency} />
        </p>
      </section>

      <section aria-labelledby="receipt-payments" className="flex flex-col gap-3">
        <h2 id="receipt-payments" className="text-xl font-semibold text-ink-900">
          {t("payments")}
        </h2>
        <PaymentList payments={booking.payments} locale={locale} />
      </section>
    </Container>
  );
}
