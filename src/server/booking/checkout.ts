import "server-only";
import { rentalRules } from "@/config/rental";
import type { Locale } from "@/i18n/routing";
import { AppError } from "@/lib/errors";
import { localized } from "@/lib/localized";
import type { CheckoutQuery, checkoutDetailsSchema } from "@/lib/validation/checkout";
import type { CarSearch } from "@/lib/validation/search";
import { checkAvailability } from "@/server/availability/service";
import { getCar, resolvePeriod, type CarDetail, type CatalogError } from "@/server/catalog/service";
import { db } from "@/server/db";
import { getQuote } from "@/server/pricing/service";
import type { Quote } from "@/server/pricing/types";
import { assertRateLimit } from "@/server/rate-limit";
import type { z } from "zod";
import { createBooking } from "./create";

type CheckoutDetails = z.output<typeof checkoutDetailsSchema>;

export type CheckoutExtra = {
  code: string;
  name: string;
  description: string;
  pricing: "PER_DAY" | "PER_BOOKING";
  priceMinor: number;
  maxPriceMinor: number | null;
  maxQuantity: number;
  currency: string;
  quantity: number;
};

export type CheckoutPeriod = NonNullable<Awaited<ReturnType<typeof resolvePeriod>>>;

export type Checkout =
  /** Bil eller periode mangler: kunden sendes tilbage til søgningen. */
  | { status: "incomplete"; car: CarDetail | null }
  | { status: "unavailable"; car: CarDetail; error: CatalogError | null }
  | {
      status: "ready";
      car: CarDetail;
      period: CheckoutPeriod;
      pickup: { name: string; address: string; city: string; deliveryEnabled: boolean };
      returnLocation: { name: string };
      extras: CheckoutExtra[];
      deliveryZones: { maxDistanceKm: number; feeMinor: number; currency: string }[];
      quote: Quote;
      /** Rabatkoden kunne ikke bruges; prisen er uden rabat. */
      discountError: string | null;
    };

/**
 * Alt bookingflowet skal vise: bilen, perioden, ekstraudstyr, leveringszoner og prisen med kundens
 * valg. Prisen beregnes her på serveren; den genberegnes, når bookingen oprettes.
 */
export async function loadCheckout(
  search: CarSearch,
  query: CheckoutQuery,
  context: { locale: string; now?: Date },
): Promise<Checkout> {
  const now = context.now ?? new Date();
  const car = query.car ? await getCar(query.car, context) : null;
  const period = await resolvePeriod(search);
  if (!car || !period) return { status: "incomplete", car };

  try {
    const availability = await checkAvailability({ ...period, carModelId: car.id }, { now });
    if (!availability.available) return { status: "unavailable", car, error: null };
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      return { status: "unavailable", car, error: { code: error.code, details: error.details } };
    }
    throw error;
  }

  const [pickup, returnLocation, extras] = await Promise.all([
    db.location.findUniqueOrThrow({
      where: { id: period.pickupLocationId },
      include: { deliveryZones: { orderBy: { maxDistanceKm: "asc" } } },
    }),
    db.location.findUniqueOrThrow({ where: { id: period.returnLocationId } }),
    db.extra.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
  ]);

  const chosen = query.extras.filter((choice) =>
    extras.some((extra) => extra.code === choice.code),
  );
  const deliveryZones = pickup.deliveryEnabled ? pickup.deliveryZones : [];
  const zone = deliveryZones.find((candidate) => candidate.maxDistanceKm === query.zone);
  const request = {
    ...period,
    carModelId: car.id,
    extras: chosen.map((choice) => ({
      code: choice.code,
      quantity: Math.min(
        choice.quantity,
        extras.find((extra) => extra.code === choice.code)!.maxQuantity,
      ),
    })),
    delivery: zone ? { distanceKm: zone.maxDistanceKm } : null,
  };

  let quote: Quote;
  let discountError: string | null = null;
  try {
    quote = await getQuote({ ...request, discountCode: query.discount ?? null }, { now });
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "DISCOUNT_INVALID") throw error;
    discountError = String(error.details?.reason ?? "INVALID");
    quote = await getQuote(request, { now });
  }

  return {
    status: "ready",
    car,
    period,
    pickup: {
      name: pickup.name,
      address: pickup.address,
      city: pickup.city,
      deliveryEnabled: deliveryZones.length > 0,
    },
    returnLocation: { name: returnLocation.name },
    extras: extras.map((extra) => ({
      code: extra.code,
      name: localized(extra.nameI18n, context.locale),
      description: localized(extra.descriptionI18n, context.locale),
      pricing: extra.pricing,
      priceMinor: extra.priceMinor,
      maxPriceMinor: extra.maxPriceMinor,
      maxQuantity: extra.maxQuantity,
      currency: extra.currency,
      quantity: request.extras.find((choice) => choice.code === extra.code)?.quantity ?? 0,
    })),
    deliveryZones: deliveryZones.map((candidate) => ({
      maxDistanceKm: candidate.maxDistanceKm,
      feeMinor: candidate.feeMinor,
      currency: candidate.currency,
    })),
    quote,
    discountError,
  };
}

const HOUR = 60 * 60_000;

/**
 * Opretter reservationen fra bookingflowet. Bil, periode og valg læses igen fra URL-parametrene,
 * og prisen beregnes forfra af `createBooking`; intet beløb fra klienten bruges.
 */
export async function createCheckoutBooking(
  search: CarSearch,
  query: CheckoutQuery,
  details: CheckoutDetails,
  context: { locale: Locale; userId: string | null; ip: string; now?: Date },
) {
  await assertRateLimit("booking", context.ip, { max: 10, windowMs: HOUR, now: context.now });
  const checkout = await loadCheckout(search, query, context);
  if (checkout.status === "incomplete") {
    throw new AppError("VALIDATION_FAILED", "Bil eller periode mangler");
  }
  if (checkout.status === "unavailable") {
    throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen er ikke ledig i perioden");
  }
  const delivery = checkout.deliveryZones.find((zone) => zone.maxDistanceKm === query.zone);
  if (delivery && !details.deliveryAddress) {
    throw new AppError("VALIDATION_FAILED", "Leveringsadresse mangler", {
      fields: ["deliveryAddress"],
    });
  }

  return createBooking(
    {
      carModelId: checkout.car.id,
      pickupLocationId: checkout.period.pickupLocationId,
      returnLocationId: checkout.period.returnLocationId,
      pickupAt: checkout.period.pickupAt,
      returnAt: checkout.period.returnAt,
      extras: checkout.extras
        .filter((extra) => extra.quantity > 0)
        .map((extra) => ({ code: extra.code, quantity: extra.quantity })),
      delivery: delivery ? { distanceKm: delivery.maxDistanceKm } : null,
      // En ugyldig kode er allerede vist i trin 1; bookingen oprettes uden den.
      discountCode: checkout.discountError ? null : (query.discount ?? null),
      customer: {
        firstName: details.firstName,
        lastName: details.lastName,
        email: details.email,
        phoneE164: details.phone,
      },
      deliveryAddress: delivery ? details.deliveryAddress : null,
      locale: context.locale,
      idempotencyKey: details.idempotencyKey,
    },
    { userId: context.userId, now: context.now, termsVersion: rentalRules.termsVersion },
  );
}
