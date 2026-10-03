import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, ShieldCheck } from "lucide-react";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { rentalRules } from "@/config/rental";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { BookingItems } from "@/components/features/booking/booking-items";
import { BookingSteps } from "@/components/features/booking/booking-steps";
import { HideWhatsAppButton } from "@/components/features/booking/hide-whatsapp";
import { StripePaymentForm } from "@/components/features/booking/stripe-payment-form";
import { formatDateTime, formatMoney } from "@/lib/format";
import { AppError } from "@/lib/errors";
import { findAccessibleBooking } from "@/server/booking/access";
import { bookingSummary } from "@/server/booking/summary";
import { startPayment, type StartedPayment } from "@/server/payments/service";
import { simulatePaymentAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/booking/pay/[reference]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "booking.pay" });
  return { title: t("title"), robots: { index: false } };
}

/** Trin 3: betaling af reservationen. Kun for den, der oprettede bookingen. */
export default async function PayPage({ params }: PageProps<"/[locale]/booking/pay/[reference]">) {
  const { locale, reference } = (await params) as { locale: Locale; reference: string };
  setRequestLocale(locale);
  const bookingId = await findAccessibleBooking(reference);
  if (!bookingId) notFound();

  const [t, booking] = await Promise.all([getTranslations("booking"), bookingSummary(bookingId)]);
  if (booking.paymentStatus === "PAID" || booking.paymentStatus === "REFUNDED") {
    redirect(localizedPath(locale, `/booking/confirmation/${reference}`));
  }

  let payment: StartedPayment | null = null;
  let problem: "expired" | "unavailable" | null = null;
  try {
    payment = await startPayment(booking.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "RESERVATION_EXPIRED") problem = "expired";
    else if (error instanceof AppError && error.code === "SERVICE_UNAVAILABLE")
      problem = "unavailable";
    else throw error;
  }

  const timeZone = booking.pickupLocation.timezone;
  const price = formatMoney(booking.totalMinor, booking.currency, locale);
  const carHref = { pathname: `/cars/${booking.car.slug}` } as const;

  if (problem === "expired") {
    return (
      <Container className="flex max-w-2xl flex-col items-start gap-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          {t("pay.expiredTitle")}
        </h1>
        <p className="text-lg text-ink-700">
          {t("pay.expiredBody", { minutes: rentalRules.reservationMinutes })}
        </p>
        <Button asChild variant="cta" size="lg">
          <Link href={carHref}>{t("pay.expiredCta")}</Link>
        </Button>
      </Container>
    );
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const returnUrl = new URL(
    localizedPath(locale, `/booking/confirmation/${reference}`),
    process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ).toString();

  return (
    <Container className="flex flex-col gap-8 py-8 sm:py-10">
      <HideWhatsAppButton />
      <BookingSteps current="payment" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{t("pay.title")}</h1>
          {booking.expiresAt ? (
            <p className="flex items-center gap-2 text-base text-ink-700">
              <Clock className="size-5 shrink-0 text-brand-700" aria-hidden />
              {t("pay.reservedUntil", {
                time: formatDateTime(booking.expiresAt, locale, timeZone),
              })}
            </p>
          ) : null}
          {booking.lastPayment?.status === "FAILED" ? (
            <Alert tone="danger">{t("pay.failed")}</Alert>
          ) : null}

          {problem === "unavailable" || !payment ? (
            <Alert tone="warning">{t("pay.unavailable")}</Alert>
          ) : payment.provider === "stripe" && publishableKey ? (
            <StripePaymentForm
              publishableKey={publishableKey}
              clientSecret={payment.clientSecret}
              returnUrl={returnUrl}
              payLabel={t("pay.submit", { price })}
            />
          ) : payment.provider === "fake" ? (
            <Card>
              <CardBody className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-ink-900">{t("pay.testTitle")}</h2>
                <p className="text-base text-ink-700">{t("pay.testBody")}</p>
                <form action={simulatePaymentAction} className="flex flex-col gap-3 sm:flex-row">
                  <input type="hidden" name="reference" value={booking.reference} />
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" name="outcome" value="succeeded" variant="cta" size="lg">
                    {t("pay.submit", { price })}
                  </Button>
                  <Button type="submit" name="outcome" value="failed" variant="secondary">
                    {t("pay.testFail")}
                  </Button>
                </form>
              </CardBody>
            </Card>
          ) : (
            <Alert tone="warning">{t("pay.unavailable")}</Alert>
          )}

          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("pay.secure")}
          </p>
        </div>

        <Card className="self-start lg:sticky lg:top-24">
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ink-900">{t("summaryTitle")}</h2>
            <BookingItems booking={booking} locale={locale} />
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
