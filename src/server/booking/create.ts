import "server-only";
import type { Booking, Prisma } from "@/generated/prisma/client";
import { rentalRules } from "@/config/rental";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createBookingSchema, type CreateBookingRequest } from "@/lib/validation/booking";
import { parseInput } from "@/lib/validation/parse";
import {
  assertBookableWindow,
  blockedPeriod,
  findFreeCars,
  loadLocation,
} from "@/server/availability/service";
import { db } from "@/server/db";
import { isCarUnavailableError, violatedConstraint } from "@/server/db-errors";
import { getQuote } from "@/server/pricing/service";
import type { Quote } from "@/server/pricing/types";
import { expireReservations } from "./expire";
import { generateReference, manageTokenFor } from "./tokens";

const MINUTE = 60_000;
/** Forsøg pr. bil, hvis den tilfældige reference eller kundeposten kolliderer. */
const ATTEMPTS_PER_CAR = 3;

export type CreatedBooking = {
  booking: Booking;
  /** Kun til gæster, og kun første gang. Sendes i bekræftelsesmailen (M8). */
  manageToken: string | null;
  /** true hvis Idempotency-Key matchede en booking, der allerede var oprettet. */
  replayed: boolean;
};

type Input = ReturnType<typeof parseCreate>;

function parseCreate(request: CreateBookingRequest) {
  return parseInput(createBookingSchema, request);
}

/**
 * Opretter en reservation (PENDING_PAYMENT) og tildeler en konkret bil af den valgte model.
 *
 * 1. Validerer input, åbningstider og varsel; beregner prisen på serveren (klientens pris bruges aldrig).
 * 2. Udløbne reservationer frigives, så de ikke blokerer.
 * 3. Ledige biler prøves én ad gangen (færrest km først). Hver indsættelse er sin egen transaktion,
 *    og databasens EXCLUDE-constraint afgør kapløb: taber vi, prøves næste bil.
 * 4. Er alle biler taget, kastes CAR_NO_LONGER_AVAILABLE.
 */
export async function createBooking(
  request: CreateBookingRequest,
  context: {
    userId?: string | null;
    now?: Date;
    termsVersion?: string | null;
    /** Medarbejderen, der opretter bookingen (telefonbooking); kunden er så gæst. */
    actorUserId?: string | null;
    /** Betalingsfrist; standard er `rentalRules.reservationMinutes` (telefonbooking: længere). */
    reservationMinutes?: number;
  } = {},
): Promise<CreatedBooking> {
  const input = parseCreate(request);
  const now = context.now ?? new Date();
  const userId = context.userId ?? null;

  if (input.idempotencyKey) {
    const existing = await findReplay(input);
    if (existing) return { booking: existing, manageToken: null, replayed: true };
  }

  const [pickup, returnLocation] = await Promise.all([
    loadLocation(input.pickupLocationId),
    loadLocation(input.returnLocationId),
  ]);
  const window = { pickupAt: input.pickupAt, returnAt: input.returnAt, pickup, returnLocation };
  assertBookableWindow(window, now);

  const accountCustomer = userId
    ? await db.customer.findUnique({ where: { userId }, select: { id: true } })
    : null;
  const quote = await getQuote(input, { customerId: accountCustomer?.id ?? null, now });

  await expireReservations(now);
  const { blockedFrom, blockedUntil } = blockedPeriod(window);
  const cars = await findFreeCars({
    locationId: pickup.id,
    blockedFrom,
    blockedUntil,
    now,
    carModelId: input.carModelId,
  });

  const items = await bookingItems(quote, input.locale);
  const discountId = quote.discountCode
    ? (await db.discount.findUniqueOrThrow({ where: { code: quote.discountCode } })).id
    : null;

  for (const car of cars) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_CAR; attempt++) {
      try {
        const reference = generateReference();
        const manage = userId ? null : manageTokenFor(reference);
        const booking = await db.$transaction(async (tx) => {
          const customerId = await saveCustomer(tx, input, userId);
          return tx.booking.create({
            data: {
              reference,
              customerId,
              carModelId: input.carModelId,
              carId: car.id,
              pickupLocationId: pickup.id,
              returnLocationId: returnLocation.id,
              pickupAt: input.pickupAt,
              returnAt: input.returnAt,
              blockedFrom,
              blockedUntil,
              status: "PENDING_PAYMENT",
              depositStatus: quote.deposit.amountMinor > 0 ? "PENDING" : "NOT_REQUIRED",
              fulfilment: input.delivery ? "DELIVERY" : "PICKUP",
              deliveryAddress: input.delivery ? input.deliveryAddress : null,
              subtotalMinor: quote.subtotalMinor,
              discountMinor: quote.discountMinor,
              totalMinor: quote.totalMinor,
              depositMinor: quote.deposit.amountMinor,
              currency: quote.currency,
              locale: input.locale,
              manageTokenHash: manage?.hash ?? null,
              expiresAt: new Date(
                now.getTime() +
                  (context.reservationMinutes ?? rentalRules.reservationMinutes) * MINUTE,
              ),
              discountId,
              termsVersion: context.termsVersion ?? null,
              idempotencyKey: input.idempotencyKey ?? null,
              items: { create: items },
              statusEvents: {
                create: {
                  fromStatus: null,
                  toStatus: "PENDING_PAYMENT",
                  actorUserId: context.actorUserId ?? userId,
                },
              },
            },
          });
        });
        logger.info(
          { bookingId: booking.id, reference: booking.reference, carId: car.id },
          "booking reserved",
        );
        return { booking, manageToken: manage?.token ?? null, replayed: false };
      } catch (error) {
        // Bilen blev taget i mellemtiden: prøv næste.
        if (isCarUnavailableError(error)) break;
        const constraint = violatedConstraint(error);
        // Samme reference findes (eller kundeposten blev oprettet samtidig): prøv igen.
        if (constraint === "Booking_reference_key" || constraint === "Customer_userId_key")
          continue;
        // Samme Idempotency-Key blev brugt samtidig: returnér den anden anmodnings booking.
        if (constraint === "Booking_idempotencyKey_key") {
          const existing = await findReplay(input);
          if (existing) return { booking: existing, manageToken: null, replayed: true };
        }
        throw error;
      }
    }
  }

  throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen er ikke længere ledig i perioden", {
    carModelId: input.carModelId,
  });
}

/** En tidligere booking med samme Idempotency-Key. Nøglen må ikke genbruges til en anden booking. */
async function findReplay(input: Input) {
  const existing = await db.booking.findUnique({
    where: { idempotencyKey: input.idempotencyKey! },
    include: { customer: { select: { email: true } } },
  });
  if (!existing) return null;
  const { customer, ...booking } = existing;
  if (
    customer.email !== input.customer.email ||
    booking.carModelId !== input.carModelId ||
    booking.pickupAt.getTime() !== input.pickupAt.getTime() ||
    booking.returnAt.getTime() !== input.returnAt.getTime()
  ) {
    throw new AppError("CONFLICT", "Idempotency-Key er brugt til en anden booking");
  }
  return booking;
}

/**
 * Kunden med konto får én kundepost, som opdateres. Gæster får en ny post pr. booking; den
 * knyttes til en konto senere via verificeret e-mail (K13), aldrig bare fordi e-mailen matcher.
 */
async function saveCustomer(tx: Prisma.TransactionClient, input: Input, userId: string | null) {
  const details = {
    firstName: input.customer.firstName,
    lastName: input.customer.lastName,
    email: input.customer.email,
    phoneE164: input.customer.phoneE164 ?? null,
    preferredLocale: input.locale,
  };
  if (!userId) return (await tx.customer.create({ data: details, select: { id: true } })).id;
  const customer = await tx.customer.upsert({
    where: { userId },
    create: { ...details, userId },
    update: details,
    select: { id: true },
  });
  return customer.id;
}

/** Prislinjerne gemmes på bookingen, så senere prisændringer ikke ændrer en eksisterende booking. */
export async function bookingItems(quote: Quote, locale: string) {
  const extraIds = quote.lines.flatMap((line) => (line.extraId ? [line.extraId] : []));
  const extras = extraIds.length
    ? await db.extra.findMany({
        where: { id: { in: extraIds } },
        select: { id: true, nameI18n: true },
      })
    : [];

  return quote.lines.map((line) => {
    const names = extras.find((extra) => extra.id === line.extraId)?.nameI18n as
      Record<string, string> | undefined;
    return {
      type: line.type,
      extraId: line.extraId ?? null,
      labelSnapshot: names?.[locale] ?? names?.da ?? line.code,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      totalMinor: line.totalMinor,
      currency: quote.currency,
    };
  });
}
