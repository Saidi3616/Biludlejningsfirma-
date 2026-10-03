import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { rentalRules } from "@/config/rental";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Link } from "@/i18n/navigation";
import { BookingSteps } from "@/components/features/booking/booking-steps";
import { CheckoutSummary } from "@/components/features/booking/checkout-summary";
import { DetailsForm } from "@/components/features/booking/details-form";
import { ExtrasForm } from "@/components/features/booking/extras-form";
import { HideWhatsAppButton } from "@/components/features/booking/hide-whatsapp";
import { formatDateTime } from "@/lib/format";
import { checkoutQueryParams, parseCheckoutQuery } from "@/lib/validation/checkout";
import { parseCarSearch, periodQuery } from "@/lib/validation/search";
import { getCurrentUser } from "@/server/auth/session";
import { loadCheckout } from "@/server/booking/checkout";
import { createBookingAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/booking">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "booking" });
  return { title: t("title"), robots: { index: false } };
}

/** Bookingflowets trin 1 (ekstraudstyr) og 2 (oplysninger). Betaling er sin egen side. */
export default async function BookingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/booking">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const raw = await searchParams;
  const search = parseCarSearch(raw);
  const query = parseCheckoutQuery(raw);
  const [t, checkout] = await Promise.all([
    getTranslations("booking"),
    loadCheckout(search, query, { locale }),
  ]);
  const period = periodQuery(search);
  const carsHref = { pathname: "/cars", query: period } as const;

  if (checkout.status !== "ready") {
    const unavailable = checkout.status === "unavailable";
    return (
      <Container className="flex max-w-2xl flex-col items-start gap-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          {t(unavailable ? "unavailable.title" : "incomplete.title")}
        </h1>
        <p className="text-lg text-ink-700">
          {unavailable ? t("unavailable.body", { car: checkout.car.name }) : t("incomplete.body")}
        </p>
        <Button asChild variant="cta" size="lg">
          <Link href={carsHref}>{t(unavailable ? "unavailable.cta" : "incomplete.cta")}</Link>
        </Button>
      </Container>
    );
  }

  const step = query.step;
  const choices = checkoutQueryParams(query);
  const hidden = { ...period, ...choices };
  const extraNames = Object.fromEntries(checkout.extras.map((extra) => [extra.code, extra.name]));
  const trip = {
    carName: checkout.car.name,
    pickupName: checkout.pickup.name,
    returnName: checkout.returnLocation.name,
    pickupAt: formatDateTime(checkout.period.pickupAt, locale, checkout.period.pickupTimeZone),
    returnAt: formatDateTime(checkout.period.returnAt, locale, checkout.period.returnTimeZone),
  };
  const bookingHref = (nextStep: "extras" | "details") =>
    `${localizedPath(locale, "/booking")}?${new URLSearchParams({ ...hidden, step: nextStep })}`;

  const user = step === "details" ? await getCurrentUser() : null;
  const [firstName = "", ...rest] = (user?.name ?? "").split(" ");

  return (
    <Container className="flex flex-col gap-8 py-8 sm:py-10">
      <div className="flex flex-col gap-4">
        <Link
          href={{ pathname: `/cars/${checkout.car.slug}`, query: period }}
          className="self-start text-base font-medium text-brand-700 hover:underline"
        >
          {t("changeCar")}
        </Link>
        <BookingSteps current={step} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1">
          <CheckoutSummary trip={trip} quote={checkout.quote} extraNames={extraNames} />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {t(step === "extras" ? "extrasTitle" : "details.title")}
          </h1>
          {step === "extras" ? (
            <ExtrasForm
              action={localizedPath(locale, "/booking")}
              hidden={{ ...period, ...(query.car ? { car: query.car } : {}) }}
              extras={checkout.extras}
              pickup={checkout.pickup}
              deliveryZones={checkout.deliveryZones}
              zone={query.zone}
              discount={query.discount}
              discountError={checkout.discountError !== null}
              discountApplied={checkout.quote.discountCode !== null}
            />
          ) : (
            <>
              <HideWhatsAppButton />
              {checkout.discountError ? (
                <Alert tone="warning">{t("discount.invalid")}</Alert>
              ) : null}
              <DetailsForm
                action={createBookingAction}
                hidden={{ ...hidden, locale }}
                idempotencyKey={randomUUID()}
                needsAddress={checkout.deliveryZones.some(
                  (zone) => zone.maxDistanceKm === query.zone,
                )}
                prefill={user ? { firstName, lastName: rest.join(" "), email: user.email } : null}
                loginHref={
                  user
                    ? null
                    : `${localizedPath(locale, "/login")}?${new URLSearchParams({ next: bookingHref("details") })}`
                }
                backHref={bookingHref("extras")}
                reservationMinutes={rentalRules.reservationMinutes}
                searchHref={`${localizedPath(locale, "/cars")}?${new URLSearchParams(period)}`}
              />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
