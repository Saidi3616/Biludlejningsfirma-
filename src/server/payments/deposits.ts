import "server-only";
import type { Payment, Prisma } from "@/generated/prisma/client";
import { rentalRules } from "@/config/rental";
import { rentalDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { manualDepositSchema } from "@/lib/validation/admin";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { violatedConstraint } from "@/server/db-errors";
import { paymentProvider } from "./provider";
import type { ProviderEvent } from "./types";

/**
 * Depositum (06-admin-flows.md F1 og F2, K6). Det tages ved udlevering, ikke ved booking, fordi
 * en kort-reservation kun holder omkring 7 dage. Ved lejer op til `depositHoldMaxDays` dage
 * reserveres beløbet på kortet; ved længere lejer trækkes det og refunderes ved afregningen.
 * Kunden kan også betale depositum kontant eller på terminalen ved skranken.
 */

/** Antal lejedage: fra prislinjen (snapshot ved booking), ellers beregnet fra perioden. */
export function bookingRentalDays(booking: {
  pickupAt: Date;
  returnAt: Date;
  items: { type: string; quantity: number }[];
  pickupLocation: { timezone: string };
}) {
  const rental = booking.items.find((item) => item.type === "RENTAL");
  if (rental) return rental.quantity;
  return rentalDays(
    booking.pickupAt,
    booking.returnAt,
    booking.pickupLocation.timezone,
    rentalRules.graceMinutes,
  );
}

/** Reservation (manuel capture) eller træk, der refunderes bagefter (K6). */
export function depositIsAuthorization(days: number) {
  return days <= rentalRules.depositHoldMaxDays;
}

async function depositBooking(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      status: true,
      depositStatus: true,
      depositMinor: true,
      currency: true,
      pickupAt: true,
      returnAt: true,
      pickupLocation: { select: { timezone: true } },
      items: { select: { type: true, quantity: true } },
      payments: {
        where: { kind: "DEPOSIT_HOLD" },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  return booking;
}

function assertDepositDue(booking: Awaited<ReturnType<typeof depositBooking>>) {
  if (booking.status !== "CONFIRMED" || booking.depositStatus !== "PENDING") {
    throw new AppError("CONFLICT", "Depositum kan ikke tages nu", {
      status: booking.status,
      depositStatus: booking.depositStatus,
    });
  }
}

export type StartedDeposit = {
  provider: "stripe" | "fake";
  clientSecret: string;
  amountMinor: number;
  currency: string;
  isAuthorization: boolean;
};

/**
 * Starter (eller genoptager) depositum med kort. Kunden indtaster kortet på personalets skærm;
 * kortdata går direkte til betalingsudbyderen. Depositummet registreres først som reserveret,
 * når udbyderens webhook bekræfter det.
 */
export async function startDeposit(ctx: PolicyContext, bookingId: string): Promise<StartedDeposit> {
  assertCan(ctx, "booking:write");
  const provider = paymentProvider();
  const booking = await depositBooking(bookingId);
  assertDepositDue(booking);
  const isAuthorization = depositIsAuthorization(bookingRentalDays(booking));
  const result = (clientSecret: string): StartedDeposit => ({
    provider: provider.name,
    clientSecret,
    amountMinor: booking.depositMinor,
    currency: booking.currency,
    isAuthorization,
  });

  const open = booking.payments.find(
    (payment) =>
      payment.provider === provider.name &&
      payment.providerRef &&
      payment.amountMinor === booking.depositMinor &&
      payment.isAuthorization === isAuthorization &&
      (payment.status === "PENDING" || payment.status === "REQUIRES_ACTION"),
  );
  if (open) {
    const clientSecret = await provider.clientSecret(open.providerRef!);
    if (clientSecret) return result(clientSecret);
  }

  const created = await provider.createDeposit({
    bookingId: booking.id,
    reference: booking.reference,
    amountMinor: booking.depositMinor,
    currency: booking.currency,
    idempotencyKey: `booking:${booking.id}:deposit:${booking.payments.length}`,
    description: `Depositum ${booking.reference}`,
    captureManually: isAuthorization,
  });
  try {
    await db.payment.create({
      data: {
        bookingId: booking.id,
        kind: "DEPOSIT_HOLD",
        status: "PENDING",
        amountMinor: booking.depositMinor,
        currency: booking.currency,
        provider: provider.name,
        providerRef: created.providerRef,
        isAuthorization,
      },
    });
  } catch (error) {
    if (violatedConstraint(error) !== "Payment_providerRef_key") throw error;
  }
  logger.info({ bookingId: booking.id, provider: provider.name }, "deposit started");
  return result(created.clientSecret);
}

/** Depositum modtaget kontant eller på terminalen ved skranken. */
export async function recordManualDeposit(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "booking:write");
  const { method } = parseInput(manualDepositSchema, input);
  const actorUserId = ctx.actor!.userId;
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, depositStatus: true, depositMinor: true, currency: true },
    });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    // Betinget opdatering: to samtidige klik registrerer kun ét depositum.
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED", depositStatus: "PENDING" },
      data: { depositStatus: "HELD" },
    });
    if (updated.count === 0) {
      throw new AppError("CONFLICT", "Depositum kan ikke tages nu", {
        status: booking.status,
        depositStatus: booking.depositStatus,
      });
    }
    const payment = await tx.payment.create({
      data: {
        bookingId,
        kind: "DEPOSIT_HOLD",
        status: "SUCCEEDED",
        method,
        amountMinor: booking.depositMinor,
        currency: booking.currency,
        provider: "manual",
        recordedByUserId: actorUserId,
      },
      select: { id: true },
    });
    await audit(tx, {
      actorUserId,
      action: "deposit.manual",
      entityType: "Booking",
      entityId: bookingId,
      diff: { paymentId: payment.id, amountMinor: booking.depositMinor, method },
    });
    return payment;
  });
}

type ReceivedEvent = Extract<ProviderEvent, { type: "payment.succeeded" | "payment.authorized" }>;

/** Webhook: depositummet er reserveret (eller trukket ved lange lejer). */
export async function applyDepositReceived(
  tx: Prisma.TransactionClient,
  payment: Payment,
  event: ReceivedEvent,
) {
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCEEDED",
      method: event.method,
      cardBrand: event.cardBrand,
      cardLast4: event.cardLast4,
      failureCode: null,
    },
  });
  const updated = await tx.booking.updateMany({
    where: { id: payment.bookingId, depositStatus: "PENDING" },
    data: { depositStatus: "HELD" },
  });
  if (updated.count === 0) {
    // Fx et andet depositum blev registreret kontant imens. Personalet frigiver det ved afregningen.
    logger.warn({ bookingId: payment.bookingId }, "deposit received but not pending");
  }
  logger.info({ bookingId: payment.bookingId, type: event.type }, "deposit held");
  return "processed" as const;
}
