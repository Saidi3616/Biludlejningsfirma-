import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import NextLink from "next/link";
import { Link } from "@/i18n/navigation";
import { whatsappLink } from "@/config/site";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { AutoRefresh } from "@/components/features/booking/auto-refresh";
import { BookingItems } from "@/components/features/booking/booking-items";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";
import { calendarEvent } from "@/lib/ics";
import { getCurrentUser } from "@/server/auth/session";
import { findAccessibleBooking } from "@/server/booking/access";
import { bookingSummary } from "@/server/booking/summary";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/booking/confirmation/[reference]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "booking.confirmation" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Hertil sendes kunden efter betaling. Bookingen bekræftes af webhooken; indtil da venter siden
 * og opdaterer sig selv.
 */
export default async function ConfirmationPage({
  params,
}: PageProps<"/[locale]/booking/confirmation/[reference]">) {
  const { locale, reference } = (await params) as { locale: Locale; reference: string };
  setRequestLocale(locale);
  const bookingId = await findAccessibleBooking(reference);
  if (!bookingId) notFound();

  const [t, booking, user] = await Promise.all([
    getTranslations("booking"),
    bookingSummary(bookingId),
    getCurrentUser(),
  ]);
  // Annulleret efter bekræftelse: bookingsiden viser status og refusion.
  if (booking.status === "CANCELLED" && booking.wasConfirmed) {
    redirect(localizedPath(locale, `/booking/${reference}`));
  }
  const payHref = localizedPath(locale, `/booking/pay/${reference}`);
  const whatsapp = (
    <Button asChild variant="whatsapp">
      <a
        href={whatsappLink(t("confirmation.whatsappPrefill", { reference }))}
        target="_blank"
        rel="noopener noreferrer"
      >
        <WhatsAppIcon />
        {t("confirmation.whatsapp")}
      </a>
    </Button>
  );

  if (booking.paymentStatus === "REFUNDED") {
    return (
      <Container className="flex max-w-2xl flex-col items-start gap-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          {t("confirmation.refundedTitle")}
        </h1>
        <p className="text-lg text-ink-700">{t("confirmation.refundedBody")}</p>
        {whatsapp}
      </Container>
    );
  }

  if (booking.paymentStatus !== "PAID") {
    const failed = booking.lastPayment?.status === "FAILED";
    return (
      <Container className="flex max-w-2xl flex-col items-start gap-6 py-16">
        {failed ? null : <AutoRefresh />}
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          {t(failed ? "confirmation.failedTitle" : "confirmation.pendingTitle")}
        </h1>
        <p className="text-lg text-ink-700" role="status">
          {t(failed ? "confirmation.failedBody" : "confirmation.pendingBody")}
        </p>
        {failed ? (
          <Button asChild variant="cta" size="lg">
            <a href={payHref}>{t("confirmation.retry")}</a>
          </Button>
        ) : null}
      </Container>
    );
  }

  const ics = calendarEvent({
    uid: `${booking.reference}@biludlejning`,
    title: t("confirmation.calendarTitle", { car: booking.car.name, reference }),
    location: `${booking.pickupLocation.name}, ${booking.pickupLocation.address}, ${booking.pickupLocation.city}`,
    start: booking.pickupAt,
    end: booking.returnAt,
  });

  return (
    <Container className="flex flex-col gap-8 py-10">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <CheckCircle2 className="size-12 text-success-700" aria-hidden />
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {t("confirmation.title", { name: booking.customer.firstName })}
          </h1>
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-5">
            <span className="text-sm font-medium text-muted">{t("confirmation.reference")}</span>
            <span className="text-3xl font-semibold tracking-wider text-ink-900">{reference}</span>
            <span className="text-sm text-muted">{t("confirmation.referenceHint")}</span>
          </div>

          <section aria-labelledby="next-steps" className="flex flex-col gap-3">
            <h2 id="next-steps" className="text-xl font-semibold text-ink-900">
              {t("confirmation.nextTitle")}
            </h2>
            <ol className="flex list-decimal flex-col gap-2 ps-6 text-base text-ink-700">
              <li>{t("confirmation.next1")}</li>
              <li>
                {booking.deliveryAddress
                  ? t("confirmation.next2Delivery")
                  : t("confirmation.next2", { location: booking.pickupLocation.name })}
              </li>
              <li>{t("confirmation.next3")}</li>
            </ol>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="secondary">
              <a
                href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
                download={`${reference}.ics`}
              >
                <CalendarPlus aria-hidden />
                {t("confirmation.calendar")}
              </a>
            </Button>
            {whatsapp}
          </div>
          <NextLink
            href={localizedPath(
              locale,
              user ? `/account/bookings/${reference}` : `/booking/${reference}`,
            )}
            className="self-start font-medium text-brand-700 underline"
          >
            {t("confirmation.manage")}
          </NextLink>

          {user ? null : (
            <Alert tone="info">
              {t("confirmation.createAccount")}{" "}
              <Link href="/register" className="font-medium text-brand-700 underline">
                {t("confirmation.createAccountCta")}
              </Link>
            </Alert>
          )}
        </div>

        <Card className="self-start">
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ink-900">{t("summaryTitle")}</h2>
            <BookingItems booking={booking} locale={locale} />
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
