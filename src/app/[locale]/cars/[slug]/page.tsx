import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Check, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { feeRates, rentalRules } from "@/config/rental";
import { whatsappLink } from "@/config/site";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ImagePlaceholder } from "@/components/ui/image-placeholder";
import { Container } from "@/components/ui/layout";
import { Price } from "@/components/ui/price";
import { CarSpecs } from "@/components/features/cars/car-specs";
import { PriceLadder } from "@/components/features/cars/price-ladder";
import { PriceSummary } from "@/components/features/cars/price-summary";
import { WhatsAppIcon } from "@/components/features/layout/whatsapp-icon";
import { SearchForm } from "@/components/features/search/search-form";
import { localDateKey, localTimeKey } from "@/lib/dates";
import { formatDateTime, formatMoney } from "@/lib/format";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import { carJsonLd } from "@/lib/structured-data";
import { parseCarSearch, periodQuery } from "@/lib/validation/search";
import { JsonLd } from "@/components/features/seo/json-ld";
import {
  businessToday,
  carAvailability,
  getCar,
  resolvePeriod,
  searchLocations,
  type CarAvailability,
} from "@/server/catalog/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/cars/[slug]">): Promise<Metadata> {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const car = await getCar(slug, { locale });
  if (!car) return {};
  return pageMetadata(locale, `/cars/${slug}`, {
    title: car.name,
    description: car.description || undefined,
    image: car.image,
  });
}

export default async function CarPage({
  params,
  searchParams,
}: PageProps<"/[locale]/cars/[slug]">) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  setRequestLocale(locale);
  const car = await getCar(slug, { locale });
  if (!car) notFound();

  const search = parseCarSearch(await searchParams);
  const [t, locations, availability, period] = await Promise.all([
    getTranslations(),
    searchLocations(),
    carAvailability(car, search, { locale }),
    resolvePeriod(search),
  ]);
  const query = periodQuery(search);
  const whatsappText = period
    ? t("car.whatsappPrefillPeriod", {
        name: car.name,
        from: formatDateTime(period.pickupAt, locale, period.pickupTimeZone),
        to: formatDateTime(period.returnAt, locale, period.returnTimeZone),
      })
    : t("car.whatsappPrefill", { name: car.name });

  return (
    <Container className="flex flex-col gap-8 py-8 sm:py-10">
      <JsonLd data={carJsonLd(car, absoluteUrl(localizedPath(locale, `/cars/${car.slug}`)))} />
      <Link
        href={{ pathname: "/cars", query }}
        className="inline-flex items-center gap-2 self-start text-base font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("car.back")}
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <div className="flex flex-col gap-8 lg:col-start-1">
          {car.image ? (
            <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-border bg-ink-50">
              <Image
                src={car.image.url}
                alt={car.image.alt}
                fill
                priority
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <ImagePlaceholder
              subject={t("cars.imagePlaceholder", { name: car.name })}
              format="professional automotive photography"
              ratio="16/9"
            />
          )}
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{car.categoryName}</Badge>
              <Badge>{t("cars.specs.year", { year: car.year })}</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {car.name}
            </h1>
            {car.description ? <p className="text-lg text-ink-700">{car.description}</p> : null}
            <p className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold text-ink-900">
                {t("cars.fromPerDay", {
                  price: formatMoney(car.fromPerDayMinor, car.currency, locale),
                })}
              </span>
              <span className="text-muted">{t("cars.perDay")}</span>
            </p>
          </header>
        </div>
        <aside
          aria-labelledby="availability"
          className="self-start lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <Card>
            <CardBody className="flex flex-col gap-5">
              <h2 id="availability" className="text-xl font-semibold text-ink-900">
                {t("car.availabilityTitle")}
              </h2>
              <SearchForm
                action={localizedPath(locale, `/cars/${car.slug}`)}
                locations={locations}
                values={search}
                minDate={businessToday()}
                submitLabel={t("search.update")}
              />
              <AvailabilityResult
                availability={availability}
                slug={car.slug}
                query={query}
                locale={locale}
                timeZone={period?.pickupTimeZone ?? "Europe/Copenhagen"}
              />
              <Button asChild variant="whatsapp" fullWidth>
                <a href={whatsappLink(whatsappText)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon />
                  {t("car.askWhatsapp")}
                </a>
              </Button>
            </CardBody>
          </Card>
        </aside>
        <div className="flex flex-col gap-8 lg:col-start-1">
          <section aria-labelledby="specs" className="flex flex-col gap-3">
            <h2 id="specs" className="text-xl font-semibold text-ink-900">
              {t("car.specsTitle")}
            </h2>
            <CarSpecs car={car} className="text-base" />
          </section>

          <section aria-labelledby="prices" className="flex flex-col gap-3">
            <h2 id="prices" className="text-xl font-semibold text-ink-900">
              {t("car.pricesTitle")}
            </h2>
            <p className="text-base text-ink-700">{t("car.pricesIntro")}</p>
            <PriceLadder tiers={car.tiers} currency={car.currency} label={t("car.pricesTitle")} />
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <section aria-labelledby="included" className="flex flex-col gap-3">
              <h2 id="included" className="text-xl font-semibold text-ink-900">
                {t("car.includedTitle")}
              </h2>
              <ul className="flex flex-col gap-2 text-base text-ink-700">
                {[
                  t("car.includedKm", { km: car.includedKmPerDay }),
                  t("car.insurance"),
                  t("car.vat"),
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="not-included" className="flex flex-col gap-3">
              <h2 id="not-included" className="text-xl font-semibold text-ink-900">
                {t("car.notIncludedTitle")}
              </h2>
              <ul className="flex flex-col gap-2 text-base text-ink-700">
                <li className="flex gap-2">
                  <X className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
                  <span>
                    {t("car.extraKm", {
                      price: formatMoney(car.extraKmFeeMinor, car.currency, locale),
                    })}
                  </span>
                </li>
                <li className="flex gap-2">
                  <X className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
                  {t("car.fuel")}
                </li>
                <li className="flex gap-2">
                  <X className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
                  {t("car.fuelFee", {
                    price: formatMoney(feeRates.fuelPerEighthMinor, car.currency, locale),
                  })}
                </li>
                <li className="flex gap-2">
                  <X className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
                  {t("car.lateFee", {
                    price: formatMoney(feeRates.latePerHourMinor, car.currency, locale),
                    minutes: rentalRules.graceMinutes,
                  })}
                </li>
              </ul>
            </section>
          </div>

          <section aria-labelledby="deposit" className="flex flex-col gap-2">
            <h2 id="deposit" className="text-xl font-semibold text-ink-900">
              {t("car.deposit", {
                price: formatMoney(car.depositMinor, car.currency, locale),
              })}
            </h2>
            <p className="text-base text-ink-700">
              {t("car.depositNote", { days: rentalRules.depositHoldMaxDays })}
            </p>
          </section>

          {car.locations.length > 0 ? (
            <section aria-labelledby="locations" className="flex flex-col gap-3">
              <h2 id="locations" className="text-xl font-semibold text-ink-900">
                {t("car.locationsTitle")}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {car.locations.map((location) => (
                  <li key={location.slug}>
                    <Link
                      href={`/locations/${location.slug}`}
                      className="inline-flex rounded-full border border-border px-3 py-1 text-sm text-ink-800 hover:bg-ink-50"
                    >
                      {location.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </Container>
  );
}

async function AvailabilityResult({
  availability,
  slug,
  query,
  locale,
  timeZone,
}: {
  availability: CarAvailability;
  slug: string;
  query: Record<string, string>;
  locale: Locale;
  timeZone: string;
}) {
  const t = await getTranslations();
  switch (availability.status) {
    case "none":
      return <p className="text-base text-muted">{t("car.availabilityHint")}</p>;
    case "error": {
      const { error } = availability;
      const message =
        error.code === "OUTSIDE_OPENING_HOURS"
          ? t("cars.errors.OUTSIDE_OPENING_HOURS")
          : error.details?.reason === "TOO_SOON"
            ? t("cars.errors.TOO_SOON", { hours: Math.ceil(rentalRules.minLeadMinutes / 60) })
            : error.code === "VALIDATION_FAILED"
              ? t("cars.errors.VALIDATION_FAILED", { days: rentalRules.maxRentalDays })
              : t("cars.errors.generic");
      return <Alert tone="warning">{message}</Alert>;
    }
    case "available":
      return (
        <div className="flex flex-col gap-4">
          <Alert tone="success">{t("car.available")}</Alert>
          <h3 className="text-base font-semibold text-ink-900">{t("car.priceSummary")}</h3>
          <PriceSummary quote={availability.quote} />
          <Button asChild variant="cta" size="lg" fullWidth>
            <Link href={{ pathname: "/booking", query: { ...query, car: slug } }}>
              {t("car.book")}
            </Link>
          </Button>
        </div>
      );
    case "unavailable":
      return (
        <div className="flex flex-col gap-4">
          <Alert tone="warning">{t("car.unavailable")}</Alert>
          {availability.nextAvailable.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-ink-900">{t("car.nextAvailable")}</p>
              <ul className="flex flex-col gap-1">
                {availability.nextAvailable.map((slot) => (
                  <li key={slot.pickupAt.toISOString()}>
                    <Link
                      href={{
                        pathname: `/cars/${slug}`,
                        query: {
                          ...query,
                          pickupDate: localDateKey(slot.pickupAt, timeZone),
                          pickupTime: localTimeKey(slot.pickupAt, timeZone),
                          returnDate: localDateKey(slot.returnAt, timeZone),
                          returnTime: localTimeKey(slot.returnAt, timeZone),
                        },
                      }}
                      className="text-brand-700 hover:underline"
                    >
                      {formatDateTime(slot.pickupAt, locale, timeZone)} –{" "}
                      {formatDateTime(slot.returnAt, locale, timeZone)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {availability.alternatives.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-ink-900">{t("car.alternatives")}</p>
              <ul className="flex flex-col gap-2">
                {availability.alternatives.map(({ car, quote }) => (
                  <li key={car.id}>
                    <Link
                      href={{ pathname: `/cars/${car.slug}`, query }}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-ink-50"
                    >
                      <span className="font-medium text-ink-900">{car.name}</span>
                      <Price amountMinor={quote.totalMinor} currency={quote.currency} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
  }
}
