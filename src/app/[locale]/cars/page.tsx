import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { rentalRules } from "@/config/rental";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/feedback";
import { Container } from "@/components/ui/layout";
import { CarCard } from "@/components/features/cars/car-card";
import { CarFilters } from "@/components/features/cars/car-filters";
import { SearchForm } from "@/components/features/search/search-form";
import { formatDateTime } from "@/lib/format";
import { parseCarSearch, periodQuery, type CarSearch } from "@/lib/validation/search";
import {
  businessToday,
  findCars,
  listCategories,
  resolvePeriod,
  searchLocations,
  type CatalogError,
} from "@/server/catalog/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/cars">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "cars" });
  return pageMetadata(locale as Locale, "/cars", {
    title: t("title"),
    description: t("description"),
  });
}

/** Filtrene som skjulte felter i søgeformularen, så de bevares ved ny søgning. */
function filterQuery(search: CarSearch): Record<string, string> {
  const keys = ["category", "transmission", "fuel", "seats", "sort"] as const;
  return Object.fromEntries(
    keys.flatMap((key) => (search[key] !== undefined ? [[key, String(search[key])]] : [])),
  );
}

export default async function CarsPage({ params, searchParams }: PageProps<"/[locale]/cars">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const search = parseCarSearch(await searchParams);
  const t = await getTranslations();
  const [result, categories, locations, period] = await Promise.all([
    findCars(search, { locale }),
    listCategories(locale),
    searchLocations(),
    resolvePeriod(search),
  ]);
  const query = periodQuery(search);
  const action = localizedPath(locale, "/cars");

  return (
    <Container className="flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {result.mode === "search" ? t("cars.searchTitle") : t("cars.title")}
        </h1>
        {result.mode === "search" && period ? (
          <p className="text-lg text-muted">
            {t("cars.period", {
              from: formatDateTime(period.pickupAt, locale, period.pickupTimeZone),
              to: formatDateTime(period.returnAt, locale, period.returnTimeZone),
              days: result.rentalDays ?? 1,
            })}
          </p>
        ) : (
          <p className="max-w-2xl text-lg text-muted">{t("cars.description")}</p>
        )}
      </header>

      <section
        aria-label={t("home.searchTitle")}
        className="rounded-lg border border-border bg-white p-4 sm:p-5"
      >
        <SearchForm
          action={action}
          locations={locations}
          values={search}
          minDate={businessToday()}
          hidden={filterQuery(search)}
          submitLabel={result.mode === "browse" ? t("search.submit") : t("search.update")}
          layout="wide"
        />
      </section>

      <CarFilters action={action} categories={categories} values={search} period={query} />

      {result.mode === "error" ? <SearchError error={result.error} /> : null}
      {result.mode === "browse" ? (
        <p className="text-base text-muted">{t("cars.searchHint")}</p>
      ) : null}

      <section aria-labelledby="results-heading" className="flex flex-col gap-4">
        <h2
          id="results-heading"
          className="text-base font-semibold text-ink-700"
          aria-live="polite"
        >
          {t("cars.results", { count: result.cars.length })}
        </h2>
        {result.cars.length === 0 ? (
          <EmptyState title={t("cars.empty.title")} description={t("cars.empty.body")} />
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {result.cars.map((car) => (
              <li key={car.id} className="flex">
                <CarCard car={car} quote={"quote" in car ? car.quote : undefined} query={query} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}

async function SearchError({ error }: { error: CatalogError }) {
  const t = await getTranslations("cars.errors");
  const message =
    error.code === "OUTSIDE_OPENING_HOURS"
      ? t("OUTSIDE_OPENING_HOURS")
      : error.details?.reason === "TOO_SOON"
        ? t("TOO_SOON", { hours: Math.ceil(rentalRules.minLeadMinutes / 60) })
        : error.code === "VALIDATION_FAILED"
          ? t("VALIDATION_FAILED", { days: rentalRules.maxRentalDays })
          : t("generic");
  return <Alert tone="warning">{message}</Alert>;
}
