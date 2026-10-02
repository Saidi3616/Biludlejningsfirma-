import "server-only";
import type { Fuel, Transmission } from "@/generated/prisma/client";
import { fromLocal, localDateKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { localized } from "@/lib/localized";
import { hasPeriod, type CarSearch } from "@/lib/validation/search";
import { checkAvailability, searchAvailability } from "@/server/availability/service";
import { db } from "@/server/db";
import { applicableTiers } from "@/server/pricing/ladder";
import { getQuote } from "@/server/pricing/service";
import type { PriceRule, Quote } from "@/server/pricing/types";

/**
 * Data til de offentlige sider (katalog, bil-side, priser, lokationer). Kun læsning; alle
 * priser kommer fra prismotoren, så siderne aldrig regner selv.
 */

/** Priser og sæsoner gælder efter dansk dato (virksomhedens tidszone). */
const BUSINESS_TIME_ZONE = "Europe/Copenhagen";

export type CatalogCar = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  year: number;
  categorySlug: string;
  categoryName: string;
  transmission: Transmission;
  fuel: Fuel;
  seats: number;
  bags: number;
  doors: number;
  airConditioning: boolean;
  description: string;
  includedKmPerDay: number;
  extraKmFeeMinor: number;
  depositMinor: number;
  currency: string;
  popularityScore: number;
  isFeatured: boolean;
  /** Prisen for én dag i dag. Vises som "fra X kr./dag". */
  fromPerDayMinor: number;
};

export type SearchedCar = CatalogCar & { quote: Quote; freeCars: number };

export type CatalogError = { code: string; details?: Record<string, unknown> };

function toPriceRules(
  rules: {
    id: string;
    carModelId: string | null;
    minDays: number;
    packageMinor: number;
    perDayMinor: number;
    currency: string;
    validFrom: Date | null;
    validTo: Date | null;
    priority: number;
  }[],
): PriceRule[] {
  return rules.map((rule) => ({
    ...rule,
    validFrom: rule.validFrom ? rule.validFrom.toISOString().slice(0, 10) : null,
    validTo: rule.validTo ? rule.validTo.toISOString().slice(0, 10) : null,
  }));
}

/** Pristrappen for en model i dag (pakker for 1, 3, 7 … dage). */
function tiersToday(rules: PriceRule[], carModelId: string, now: Date) {
  return applicableTiers(rules, carModelId, localDateKey(now, BUSINESS_TIME_ZONE));
}

type ModelRow = Awaited<ReturnType<typeof loadModels>>[number];

async function loadModels(where: { slug?: string } = {}) {
  return db.carModel.findMany({
    where: { isActive: true, ...where },
    include: {
      category: { include: { pricingRules: true } },
      pricingRules: true,
    },
  });
}

function toCatalogCar(row: ModelRow, locale: string, now: Date): CatalogCar | null {
  // Kategoriens regler inkluderer også modellens egne (carModelId er sat på dem).
  const rules = toPriceRules(row.category.pricingRules);
  const tiers = tiersToday(rules, row.id, now);
  const oneDay = tiers.find((tier) => tier.minDays === 1) ?? tiers[0];
  // En model uden pris kan ikke bookes og vises ikke.
  if (!oneDay) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: `${row.brand} ${row.model}`,
    brand: row.brand,
    year: row.year,
    categorySlug: row.category.slug,
    categoryName: localized(row.category.nameI18n, locale),
    transmission: row.transmission,
    fuel: row.fuel,
    seats: row.seats,
    bags: row.bags,
    doors: row.doors,
    airConditioning: row.airConditioning,
    description: localized(row.descriptionI18n, locale),
    includedKmPerDay: row.includedKmPerDay,
    extraKmFeeMinor: row.extraKmFeeMinor,
    depositMinor: row.depositMinor,
    currency: row.currency,
    popularityScore: row.popularityScore,
    isFeatured: row.isFeatured,
    fromPerDayMinor: oneDay.minDays === 1 ? oneDay.packageMinor : oneDay.perDayMinor,
  };
}

function matchesFilters(car: CatalogCar, search: CarSearch) {
  return (
    (!search.category || car.categorySlug === search.category) &&
    (!search.transmission || car.transmission === search.transmission) &&
    (!search.fuel || car.fuel === search.fuel) &&
    (!search.seats || car.seats >= search.seats)
  );
}

function sortCars<T extends CatalogCar & { quote?: Quote }>(cars: T[], sort: CarSearch["sort"]) {
  const price = (car: T) => car.quote?.totalMinor ?? car.fromPerDayMinor;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const compare: Record<CarSearch["sort"], (a: T, b: T) => number> = {
    recommended: (a, b) =>
      Number(b.isFeatured) - Number(a.isFeatured) ||
      b.popularityScore - a.popularityScore ||
      byName(a, b),
    price_asc: (a, b) => price(a) - price(b) || byName(a, b),
    price_desc: (a, b) => price(b) - price(a) || byName(a, b),
    popular: (a, b) => b.popularityScore - a.popularityScore || byName(a, b),
    newest: (a, b) => b.year - a.year || byName(a, b),
  };
  return [...cars].sort(compare[sort]);
}

export type CatalogResult =
  | { mode: "browse"; cars: CatalogCar[] }
  | { mode: "search"; cars: SearchedCar[]; rentalDays: number | null }
  | { mode: "error"; error: CatalogError; cars: CatalogCar[] };

/** Den periode, kunden har valgt, omsat til tidspunkter i lokationernes tidszoner. */
export async function resolvePeriod(search: CarSearch) {
  if (!hasPeriod(search)) return null;
  const slugs = [search.location, search.returnLocation ?? search.location];
  const locations = await db.location.findMany({
    where: { slug: { in: slugs }, isActive: true },
    select: { id: true, slug: true, timezone: true },
  });
  const pickup = locations.find((location) => location.slug === slugs[0]);
  const returnLocation = locations.find((location) => location.slug === slugs[1]);
  if (!pickup || !returnLocation) return null;
  return {
    pickupLocationId: pickup.id,
    returnLocationId: returnLocation.id,
    pickupAt: fromLocal(search.pickupDate, search.pickupTime, pickup.timezone),
    returnAt: fromLocal(search.returnDate, search.returnTime, returnLocation.timezone),
    pickupTimeZone: pickup.timezone,
    returnTimeZone: returnLocation.timezone,
  };
}

function catalogError(error: unknown): CatalogError {
  if (error instanceof AppError && error.status < 500) {
    return { code: error.code, details: error.details };
  }
  throw error;
}

/**
 * Katalogets biler. Uden periode: alle aktive modeller med "fra"-pris. Med sted og periode:
 * kun ledige modeller med totalpris for perioden.
 */
export async function findCars(
  search: CarSearch,
  context: { locale: string; now?: Date },
): Promise<CatalogResult> {
  const now = context.now ?? new Date();
  const all = (await loadModels())
    .map((row) => toCatalogCar(row, context.locale, now))
    .filter((car): car is CatalogCar => car !== null);
  const browse = sortCars(
    all.filter((car) => matchesFilters(car, search)),
    search.sort,
  );

  const period = await resolvePeriod(search);
  if (!period) return { mode: "browse", cars: browse };

  try {
    const available = await searchAvailability(period, { now });
    const cars = available.flatMap(({ carModelId, freeCars, quote }) => {
      const car = all.find((candidate) => candidate.id === carModelId);
      return car && matchesFilters(car, search) ? [{ ...car, quote, freeCars }] : [];
    });
    return {
      mode: "search",
      cars: sortCars(cars, search.sort),
      rentalDays: available[0]?.quote.rentalDays ?? null,
    };
  } catch (error) {
    return { mode: "error", error: catalogError(error), cars: browse };
  }
}

/** Fremhævede modeller til forsiden. */
export async function featuredCars(context: { locale: string; limit: number; now?: Date }) {
  const now = context.now ?? new Date();
  const cars = (await loadModels())
    .map((row) => toCatalogCar(row, context.locale, now))
    .filter((car): car is CatalogCar => car !== null);
  return sortCars(cars, "recommended").slice(0, context.limit);
}

export type CarDetail = CatalogCar & {
  tiers: { minDays: number; packageMinor: number; perDayMinor: number }[];
  locations: { slug: string; name: string }[];
};

export async function getCar(
  slug: string,
  context: { locale: string; now?: Date },
): Promise<CarDetail | null> {
  const now = context.now ?? new Date();
  const [row] = await loadModels({ slug });
  if (!row) return null;
  const car = toCatalogCar(row, context.locale, now);
  if (!car) return null;
  const tiers = tiersToday(toPriceRules(row.category.pricingRules), row.id, now).map((tier) => ({
    minDays: tier.minDays,
    packageMinor: tier.packageMinor,
    perDayMinor: tier.perDayMinor,
  }));
  const locations = await db.location.findMany({
    where: { isActive: true, cars: { some: { carModelId: row.id, opStatus: "ACTIVE" } } },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
  return { ...car, tiers, locations };
}

export type CarAvailability =
  | { status: "none" }
  | { status: "error"; error: CatalogError }
  | { status: "available"; quote: Quote; freeCars: number }
  | {
      status: "unavailable";
      nextAvailable: { pickupAt: Date; returnAt: Date }[];
      alternatives: { car: CatalogCar; quote: Quote }[];
    };

/** Er bilen ledig i den valgte periode, og hvad koster den? */
export async function carAvailability(
  car: CatalogCar,
  search: CarSearch,
  context: { locale: string; now?: Date },
): Promise<CarAvailability> {
  const now = context.now ?? new Date();
  const period = await resolvePeriod(search);
  if (!period) return { status: "none" };
  try {
    const result = await checkAvailability({ ...period, carModelId: car.id }, { now });
    if (result.available) {
      const quote = await getQuote({ ...period, carModelId: car.id }, { now });
      return { status: "available", quote, freeCars: result.freeCars };
    }
    const rows = await loadModels();
    const alternatives = result.alternatives.flatMap(({ carModelId, quote }) => {
      const row = rows.find((candidate) => candidate.id === carModelId);
      const alternative = row ? toCatalogCar(row, context.locale, now) : null;
      return alternative ? [{ car: alternative, quote }] : [];
    });
    return { status: "unavailable", nextAvailable: result.nextAvailable, alternatives };
  } catch (error) {
    return { status: "error", error: catalogError(error) };
  }
}

export async function listCategories(locale: string) {
  const categories = await db.carCategory.findMany({
    where: { models: { some: { isActive: true } } },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
  });
  return categories.map((category) => ({
    slug: category.slug,
    name: localized(category.nameI18n, locale),
  }));
}

/** Prisoversigt: kategoriernes pristrappe i dag, ekstraudstyr og gebyrer. */
export async function pricingOverview(locale: string, now = new Date()) {
  const dateKey = localDateKey(now, BUSINESS_TIME_ZONE);
  const [categories, extras, locations] = await Promise.all([
    db.carCategory.findMany({
      where: { models: { some: { isActive: true } } },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      include: { pricingRules: { where: { carModelId: null } } },
    }),
    db.extra.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    db.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { deliveryZones: { orderBy: { maxDistanceKm: "asc" } } },
    }),
  ]);
  return {
    categories: categories.flatMap((category) => {
      // Uden model-id gælder kun kategoriens egne regler.
      const tiers = applicableTiers(toPriceRules(category.pricingRules), "", dateKey);
      if (tiers.length === 0) return [];
      return [
        {
          slug: category.slug,
          name: localized(category.nameI18n, locale),
          currency: tiers[0]!.currency,
          tiers: tiers.map(({ minDays, packageMinor, perDayMinor }) => ({
            minDays,
            packageMinor,
            perDayMinor,
          })),
        },
      ];
    }),
    extras: extras.map((extra) => ({
      code: extra.code,
      name: localized(extra.nameI18n, locale),
      description: localized(extra.descriptionI18n, locale),
      pricing: extra.pricing,
      priceMinor: extra.priceMinor,
      maxPriceMinor: extra.maxPriceMinor,
      currency: extra.currency,
    })),
    locations: locations.map((location) => ({
      slug: location.slug,
      name: location.name,
      oneWayFeeMinor: location.oneWayFeeMinor,
      deliveryEnabled: location.deliveryEnabled,
      deliveryZones: location.deliveryZones.map(({ maxDistanceKm, feeMinor, currency }) => ({
        maxDistanceKm,
        feeMinor,
        currency,
      })),
    })),
  };
}

export async function listLocations() {
  return db.location.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { openingHours: true },
  });
}

export async function getLocation(slug: string) {
  return db.location.findFirst({
    where: { slug, isActive: true },
    include: {
      openingHours: true,
      deliveryZones: { orderBy: { maxDistanceKm: "asc" } },
    },
  });
}

/** Offentliggjorte anmeldelser, nyeste først, med gennemsnit. */
export async function publishedReviews(limit: number) {
  const where = { status: "PUBLISHED" as const };
  const [reviews, stats] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, rating: true, comment: true, displayName: true, createdAt: true },
    }),
    db.review.aggregate({ where, _avg: { rating: true }, _count: true }),
  ]);
  return { reviews, average: stats._avg.rating, count: stats._count };
}

/** Lokationer til søgeformularen. */
export async function searchLocations() {
  return db.location.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { slug: true, name: true },
  });
}

/** Dags dato på virksomhedens ur ("YYYY-MM-DD"), fx som mindste dato i datovælgeren. */
export function businessToday(now = new Date()) {
  return localDateKey(now, BUSINESS_TIME_ZONE);
}
