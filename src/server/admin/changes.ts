import "server-only";
import type { BookingStatus, Prisma } from "@/generated/prisma/client";
import { notificationRules } from "@/config/notifications";
import { fromLocal } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { netPaidMinor } from "@/lib/payments";
import { reassignSchema, rescheduleSchema } from "@/lib/validation/admin";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import {
  assertBookableWindow,
  blockedPeriod,
  findFreeCars,
  loadLocation,
} from "@/server/availability/service";
import { bookingItems } from "@/server/booking/create";
import { db } from "@/server/db";
import { isCarUnavailableError } from "@/server/db-errors";
import { queueBookingNotification } from "@/server/notifications/queue";
import { getQuote } from "@/server/pricing/service";

const HOUR = 60 * 60_000;

/** Bookinger, personalet kan flytte eller give en anden bil: endnu ikke udleveret. */
const CHANGEABLE: BookingStatus[] = ["PENDING_PAYMENT", "CONFIRMED"];

async function loadChangeable(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: { include: { extra: { select: { code: true } } } },
      discount: { select: { code: true } },
      payments: { select: { kind: true, status: true, amountMinor: true } },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  if (!CHANGEABLE.includes(booking.status)) {
    throw new AppError("CONFLICT", "Bookingen kan ikke ændres", { status: booking.status });
  }
  return booking;
}

type Changeable = Awaited<ReturnType<typeof loadChangeable>>;

/** Ledige biler af samme model for en periode; bookingen selv blokerer ikke. */
async function freeCarsFor(
  booking: Pick<Changeable, "id" | "carModelId" | "pickupLocationId">,
  blocked: { blockedFrom: Date; blockedUntil: Date },
  now: Date,
) {
  const free = await findFreeCars({
    locationId: booking.pickupLocationId,
    ...blocked,
    now,
    carModelId: booking.carModelId,
    excludeBookingId: booking.id,
  });
  if (free.length === 0) return [];
  return db.car.findMany({
    where: { id: { in: free.map((car) => car.id) } },
    orderBy: [{ odometerKm: "asc" }, { id: "asc" }],
    select: { id: true, registrationNumber: true, color: true },
  });
}

/** Ny pris for perioden: samme model, ekstraudstyr og rabatkode; levering beholdes. */
async function newPrice(booking: Changeable, pickupAt: Date, returnAt: Date, now: Date) {
  const request = {
    carModelId: booking.carModelId,
    pickupLocationId: booking.pickupLocationId,
    returnLocationId: booking.returnLocationId,
    pickupAt,
    returnAt,
    extras: booking.items.flatMap((item) =>
      item.type === "EXTRA" && item.extra
        ? [{ code: item.extra.code, quantity: item.quantity }]
        : [],
    ),
    discountCode: booking.discount?.code ?? null,
  };
  const context = { customerId: booking.customerId, now };
  const quote = await getQuote(request, context).catch((error: unknown) => {
    // Rabatkoden er udløbet eller brugt op: prisen beregnes uden.
    if (error instanceof AppError && error.code === "DISCOUNT_INVALID") {
      return getQuote({ ...request, discountCode: null }, context);
    }
    throw error;
  });
  const delivery = booking.items.filter((item) => item.type === "DELIVERY_FEE");
  const deliveryMinor = delivery.reduce((sum, item) => sum + item.totalMinor, 0);
  return {
    subtotalMinor: quote.subtotalMinor + deliveryMinor,
    discountMinor: quote.discountMinor,
    totalMinor: quote.totalMinor + deliveryMinor,
    items: [...(await bookingItems(quote, booking.locale)), ...delivery.map(copyItem)],
    discountApplied: quote.discountMinor > 0,
  };
}

function copyItem(item: Changeable["items"][number]) {
  return {
    type: item.type,
    extraId: item.extraId,
    labelSnapshot: item.labelSnapshot,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    totalMinor: item.totalMinor,
    currency: item.currency,
  };
}

/** Beregner en ny periode: bil (samme hvis muligt) og pris. Skriver intet. */
async function planReschedule(booking: Changeable, input: Record<string, unknown>, now: Date) {
  const values = parseInput(rescheduleSchema, input);
  const [pickup, returnLocation] = await Promise.all([
    loadLocation(booking.pickupLocationId),
    loadLocation(booking.returnLocationId),
  ]);
  const pickupAt = fromLocal(values.pickupDate, values.pickupTime, pickup.timezone);
  const returnAt = fromLocal(values.returnDate, values.returnTime, returnLocation.timezone);
  const window = { pickupAt, returnAt, pickup, returnLocation };
  assertBookableWindow(window, now);
  const blocked = blockedPeriod(window);
  const cars = await freeCarsFor(booking, blocked, now);
  const car = cars.find((candidate) => candidate.id === booking.carId) ?? cars[0];
  if (!car) {
    throw new AppError("CAR_NO_LONGER_AVAILABLE", "Ingen bil af modellen er ledig i perioden");
  }
  const price = await newPrice(booking, pickupAt, returnAt, now);
  return { values, pickupAt, returnAt, blocked, car, price };
}

/** F5 trin 1: hvad sker der, hvis bookingen flyttes? Vises før personalet bekræfter. */
export async function reschedulePreview(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "booking:write");
  const booking = await loadChangeable(bookingId);
  const plan = await planReschedule(booking, input, now);
  return {
    pickupAt: plan.pickupAt,
    returnAt: plan.returnAt,
    sameCar: plan.car.id === booking.carId,
    registration: plan.car.registrationNumber,
    currentTotalMinor: booking.totalMinor,
    newTotalMinor: plan.price.totalMinor,
    paidMinor: netPaidMinor(booking.payments),
    currency: booking.currency,
  };
}

/**
 * F5: flytter bookingen. Samme bil, hvis den er ledig, ellers en anden af samme model. Prisen
 * beholdes eller beregnes forfra. Påmindelser flyttes med, og kunden får besked. En difference
 * opkræves ved skranken (manuel betaling) eller refunderes (refusion).
 */
export async function rescheduleBooking(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "booking:write");
  const actorUserId = ctx.actor!.userId;
  const booking = await loadChangeable(bookingId);
  const plan = await planReschedule(booking, input, now);
  const repriced = plan.values.price === "new";
  const totalMinor = repriced ? plan.price.totalMinor : booking.totalMinor;

  try {
    await db.$transaction(async (tx) => {
      // Optimistisk lås: bookingen må ikke have skiftet status siden vi læste den.
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: booking.status, updatedAt: booking.updatedAt },
        data: {
          pickupAt: plan.pickupAt,
          returnAt: plan.returnAt,
          ...plan.blocked,
          carId: plan.car.id,
          ...(repriced
            ? {
                subtotalMinor: plan.price.subtotalMinor,
                discountMinor: plan.price.discountMinor,
                totalMinor: plan.price.totalMinor,
              }
            : {}),
        },
      });
      if (updated.count === 0) throw new AppError("CONFLICT", "Bookingen blev ændret samtidig");
      if (repriced) {
        await tx.bookingItem.deleteMany({ where: { bookingId } });
        await tx.bookingItem.createMany({
          data: plan.price.items.map((item) => ({ ...item, bookingId })),
        });
      }
      await tx.bookingStatusEvent.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: booking.status,
          actorUserId,
          reason: "rescheduled",
        },
      });
      await moveReminders(tx, bookingId, plan.pickupAt, plan.returnAt, now);
      await queueBookingNotification(tx, bookingId, "BOOKING_CHANGED", {
        now,
        dedupeSuffix: String(now.getTime()),
      });
      await audit(tx, {
        actorUserId,
        action: "booking.reschedule",
        entityType: "Booking",
        entityId: bookingId,
        diff: {
          from: {
            pickupAt: booking.pickupAt.toISOString(),
            returnAt: booking.returnAt.toISOString(),
            carId: booking.carId,
            totalMinor: booking.totalMinor,
          },
          to: {
            pickupAt: plan.pickupAt.toISOString(),
            returnAt: plan.returnAt.toISOString(),
            carId: plan.car.id,
            totalMinor,
          },
        },
      });
    });
  } catch (error) {
    if (isCarUnavailableError(error)) {
      throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen blev taget i mellemtiden");
    }
    throw error;
  }
  logger.info({ bookingId, carChanged: plan.car.id !== booking.carId }, "booking rescheduled");
  return {
    carChanged: plan.car.id !== booking.carId,
    totalMinor,
    balanceMinor: totalMinor - netPaidMinor(booking.payments),
  };
}

/** Påmindelser, der ikke er sendt, følger den nye periode. */
async function moveReminders(
  tx: Prisma.TransactionClient,
  bookingId: string,
  pickupAt: Date,
  returnAt: Date,
  now: Date,
) {
  const at = (date: Date) => (date > now ? date : now);
  const reminders = [
    {
      template: "PICKUP_REMINDER",
      at: at(new Date(pickupAt.getTime() - notificationRules.pickupReminderHoursBefore * HOUR)),
    },
    {
      template: "RETURN_REMINDER",
      at: at(new Date(returnAt.getTime() - notificationRules.returnReminderHoursBefore * HOUR)),
    },
  ];
  for (const reminder of reminders) {
    await tx.notification.updateMany({
      where: { bookingId, template: reminder.template, status: "PENDING" },
      data: { scheduledAt: reminder.at, nextAttemptAt: reminder.at },
    });
  }
}

/** Biler, bookingen kan flyttes til i sin nuværende periode (F4/F5 "omplacér"). */
export async function reassignOptions(ctx: PolicyContext, bookingId: string, now = new Date()) {
  assertCan(ctx, "booking:write");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      carId: true,
      carModelId: true,
      pickupLocationId: true,
      blockedFrom: true,
      blockedUntil: true,
    },
  });
  if (!booking || !CHANGEABLE.includes(booking.status)) return [];
  const cars = await freeCarsFor(
    booking,
    { blockedFrom: booking.blockedFrom, blockedUntil: booking.blockedUntil },
    now,
  );
  return cars.filter((car) => car.id !== booking.carId);
}

/** Giver bookingen en anden ledig bil af samme model. Databasen afviser dobbeltbooking. */
export async function reassignCar(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "booking:write");
  const { carId } = parseInput(reassignSchema, input);
  const actorUserId = ctx.actor!.userId;
  const booking = await loadChangeable(bookingId);
  const options = await freeCarsFor(
    booking,
    { blockedFrom: booking.blockedFrom, blockedUntil: booking.blockedUntil },
    now,
  );
  if (!options.some((car) => car.id === carId) || carId === booking.carId) {
    throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen er ikke ledig i perioden");
  }
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: booking.status, carId: booking.carId },
        data: { carId },
      });
      if (updated.count === 0) throw new AppError("CONFLICT", "Bookingen blev ændret samtidig");
      await audit(tx, {
        actorUserId,
        action: "booking.reassign",
        entityType: "Booking",
        entityId: bookingId,
        diff: { from: booking.carId, to: carId },
      });
    });
  } catch (error) {
    if (isCarUnavailableError(error)) {
      throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen blev taget i mellemtiden");
    }
    throw error;
  }
  logger.info({ bookingId, carId }, "booking reassigned to another car");
}
