import "server-only";
import { rentalRules } from "@/config/rental";
import { fromLocal } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { phoneBookingSchema } from "@/lib/validation/admin";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { loadLocation } from "@/server/availability/service";
import { createBooking } from "@/server/booking/create";
import { applyTransition } from "@/server/booking/state";
import { db } from "@/server/db";
import { queueBookingNotification } from "@/server/notifications/queue";

/** Kunden har et døgn til at betale via linket fra en telefonbooking. */
export const PAYMENT_LINK_MINUTES = 24 * 60;

/** Det, formularen skal vise: aktive modeller, lokationer og ekstraudstyr. */
export async function phoneBookingOptions(ctx: PolicyContext) {
  assertCan(ctx, "booking:write");
  const [models, locations, extras] = await Promise.all([
    db.carModel.findMany({
      where: { isActive: true },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      select: { id: true, brand: true, model: true },
    }),
    db.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.extra.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { code: true, nameI18n: true },
    }),
  ]);
  return {
    models: models.map((model) => ({ id: model.id, name: `${model.brand} ${model.model}` })),
    locations,
    extras: extras.map((extra) => ({
      code: extra.code,
      name: (extra.nameI18n as Record<string, string>).da ?? extra.code,
    })),
  };
}

/**
 * F3: telefon- og skrankebooking med samme booking-service som web (samme regler, samme
 * constraint). Kunden oprettes som gæst og kan senere knytte bookingen til en konto.
 * - "link": reservationen holdes i et døgn, og kunden får et betalingslink på e-mail.
 * - "counter": bookingen bekræftes med det samme og betales ved skranken.
 */
export async function createPhoneBooking(
  ctx: PolicyContext,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "booking:write");
  const values = parseInput(phoneBookingSchema, input);
  const actorUserId = ctx.actor!.userId;
  const [pickup, returnLocation] = await Promise.all([
    loadLocation(values.pickupLocationId),
    loadLocation(values.returnLocationId),
  ]);

  const { booking } = await createBooking(
    {
      carModelId: values.carModelId,
      pickupLocationId: pickup.id,
      returnLocationId: returnLocation.id,
      pickupAt: fromLocal(values.pickupDate, values.pickupTime, pickup.timezone),
      returnAt: fromLocal(values.returnDate, values.returnTime, returnLocation.timezone),
      extras: values.extras.map((code) => ({ code, quantity: 1 })),
      discountCode: values.discountCode,
      customer: {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phoneE164: values.phone,
      },
      locale: values.locale,
    },
    {
      userId: null,
      actorUserId,
      now,
      termsVersion: rentalRules.termsVersion,
      reservationMinutes: values.payment === "link" ? PAYMENT_LINK_MINUTES : undefined,
    },
  );

  await db.$transaction(async (tx) => {
    if (values.payment === "counter") {
      await applyTransition(tx, booking.id, "CONFIRMED", {
        actorUserId,
        reason: "pay_at_counter",
        now,
      });
    } else {
      await queueBookingNotification(tx, booking.id, "PAYMENT_REQUEST", { now });
    }
    await audit(tx, {
      actorUserId,
      action: "booking.phone_create",
      entityType: "Booking",
      entityId: booking.id,
      diff: { payment: values.payment },
    });
  });
  logger.info({ bookingId: booking.id, payment: values.payment }, "phone booking created");
  return { reference: booking.reference, payment: values.payment };
}
