import "server-only";
import type { BookingStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { netPaidMinor } from "@/lib/payments";
import { adminCancelSchema, adminRefundSchema, manualPaymentSchema } from "@/lib/validation/admin";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { cancellationTerms, cancelWithRefund } from "@/server/booking/cancel";
import { applyTransition } from "@/server/booking/state";
import { db } from "@/server/db";
import { isCarUnavailableError } from "@/server/db-errors";
import { queueBookingNotification } from "@/server/notifications/queue";
import { planRefunds, processRefunds, refreshPaymentStatus } from "@/server/payments/refunds";

/** Personalet kan annullere en booking, indtil bilen er udleveret (F6). */
const ADMIN_CANCELLABLE: BookingStatus[] = ["PENDING_PAYMENT", "CONFIRMED"];

/**
 * Forslag til annullering fra admin: kundens politik, hvis bookingen er bekræftet og ikke
 * hentet, ellers ingen refusion. Lederen kan overstyre beløbet (op til det betalte).
 */
export async function adminCancellationPreview(
  ctx: PolicyContext,
  bookingId: string,
  now = new Date(),
) {
  assertCan(ctx, "booking:cancel");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      pickupAt: true,
      currency: true,
      payments: { select: { kind: true, status: true, amountMinor: true } },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  if (!ADMIN_CANCELLABLE.includes(booking.status)) return { allowed: false as const };
  const paidMinor = Math.max(0, netPaidMinor(booking.payments));
  const terms = cancellationTerms(booking, now);
  return {
    allowed: true as const,
    paidMinor,
    suggestedRefundMinor: terms.allowed ? terms.refundMinor : 0,
    free: terms.allowed ? terms.free : null,
    currency: booking.currency,
  };
}

/** F6: annullér med årsag; refusionen gennemføres hos udbyderen eller registreres som kontant. */
export async function adminCancelBooking(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "booking:cancel");
  const { refund, reason } = parseInput(adminCancelSchema, input);
  if (refund > 0) assertCan(ctx, "payment:refund");
  const actorUserId = ctx.actor!.userId;

  const result = await cancelWithRefund(bookingId, {
    actorUserId,
    now,
    decide: (booking) => {
      if (!ADMIN_CANCELLABLE.includes(booking.status)) {
        throw new AppError("CONFLICT", "Bookingen kan ikke annulleres", {
          status: booking.status,
        });
      }
      if (refund > Math.max(0, netPaidMinor(booking.payments))) {
        throw new AppError("VALIDATION_FAILED", "Refusionen er større end det betalte", {
          fields: ["refund"],
        });
      }
      return { refundMinor: refund, reason };
    },
    after: async (tx, refundMinor) => {
      await audit(tx, {
        actorUserId,
        action: "booking.cancel",
        entityType: "Booking",
        entityId: bookingId,
        diff: { refundMinor },
      });
    },
  });
  logger.info({ bookingId, refundMinor: result.refundMinor }, "booking cancelled by staff");
  return result;
}

/** Refusion uden annullering (MANAGER+), fx efter en ændring til en billigere periode. */
export async function adminRefund(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "payment:refund");
  const { amount } = parseInput(adminRefundSchema, input);
  const actorUserId = ctx.actor!.userId;
  const planned = await db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { payments: { select: { kind: true, status: true, amountMinor: true } } },
    });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    if (amount > netPaidMinor(booking.payments)) {
      throw new AppError("VALIDATION_FAILED", "Refusionen er større end det betalte", {
        fields: ["amount"],
      });
    }
    const planned = await planRefunds(tx, bookingId, amount, { actorUserId });
    await refreshPaymentStatus(tx, bookingId);
    await audit(tx, {
      actorUserId,
      action: "payment.refund",
      entityType: "Booking",
      entityId: bookingId,
      diff: { amountMinor: amount },
    });
    return planned;
  });
  const failed = await processRefunds(bookingId, planned);
  logger.info({ bookingId, amountMinor: amount, failed }, "refund by staff");
  return { refundsFailed: failed };
}

/**
 * En ventende refusion: prøv igen hos udbyderen (kortbetaling), eller registrér, at pengene er
 * betalt tilbage ved skranken (kontant betaling, fx efter kundens egen annullering).
 */
export async function retryRefund(ctx: PolicyContext, paymentId: string) {
  assertCan(ctx, "payment:refund");
  const refund = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      bookingId: true,
      kind: true,
      status: true,
      amountMinor: true,
      provider: true,
      parent: { select: { providerRef: true } },
    },
  });
  if (!refund || refund.kind !== "REFUND" || refund.status !== "PENDING") {
    throw new AppError("CONFLICT", "Refusionen kan ikke prøves igen");
  }
  const actorUserId = ctx.actor!.userId;
  if (refund.provider === "manual") {
    await db.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: refund.id, status: "PENDING" },
        data: { status: "SUCCEEDED", recordedByUserId: actorUserId },
      });
      if (updated.count === 0) throw new AppError("CONFLICT", "Refusionen er allerede registreret");
      await refreshPaymentStatus(tx, refund.bookingId);
      await audit(tx, {
        actorUserId,
        action: "payment.refund_manual",
        entityType: "Payment",
        entityId: refund.id,
      });
    });
    return;
  }
  if (!refund.parent?.providerRef) {
    throw new AppError("CONFLICT", "Refusionen kan ikke prøves igen");
  }
  const failed = await processRefunds(refund.bookingId, [
    { id: refund.id, chargeRef: refund.parent.providerRef, amountMinor: refund.amountMinor },
  ]);
  await audit(db, {
    actorUserId,
    action: "payment.refund_retry",
    entityType: "Payment",
    entityId: refund.id,
    diff: { succeeded: failed === 0 },
  });
  if (failed > 0)
    throw new AppError("SERVICE_UNAVAILABLE", "Betalingsudbyderen afviste refusionen");
}

/** Bookinger, der kan modtage en betaling ved skranken. */
const PAYABLE: BookingStatus[] = ["PENDING_PAYMENT", "EXPIRED", "CONFIRMED", "ACTIVE", "COMPLETED"];

/**
 * Betaling ved skranken eller bankoverførsel (STAFF+). En reservation, der venter på betaling,
 * bliver bekræftet (kunden får bekræftelsen); ellers får kunden en kvittering for betalingen.
 */
export async function recordManualPayment(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "booking:write");
  const { amount, method } = parseInput(manualPaymentSchema, input);
  const actorUserId = ctx.actor!.userId;
  try {
    return await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { status: true, currency: true },
      });
      if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
      if (!PAYABLE.includes(booking.status)) {
        throw new AppError("CONFLICT", "Bookingen kan ikke modtage betaling", {
          status: booking.status,
        });
      }
      const payment = await tx.payment.create({
        data: {
          bookingId,
          kind: "MANUAL",
          status: "SUCCEEDED",
          method,
          amountMinor: amount,
          currency: booking.currency,
          provider: "manual",
          recordedByUserId: actorUserId,
        },
        select: { id: true },
      });
      await refreshPaymentStatus(tx, bookingId);
      if (booking.status === "PENDING_PAYMENT" || booking.status === "EXPIRED") {
        await applyTransition(tx, bookingId, "CONFIRMED", {
          actorUserId,
          reason: "manual_payment",
          now,
        });
      } else {
        await queueBookingNotification(tx, bookingId, "PAYMENT_RECEIVED", {
          now,
          dedupeSuffix: payment.id,
        });
      }
      await audit(tx, {
        actorUserId,
        action: "payment.manual",
        entityType: "Booking",
        entityId: bookingId,
        diff: { paymentId: payment.id, amountMinor: amount, method },
      });
      return { paymentId: payment.id };
    });
  } catch (error) {
    // En udløbet reservation, hvis bil er taget i mellemtiden.
    if (isCarUnavailableError(error)) {
      throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen er ikke længere ledig");
    }
    throw error;
  }
}
