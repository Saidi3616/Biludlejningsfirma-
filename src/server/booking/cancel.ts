import "server-only";
import type { BookingStatus, PaymentKind, PaymentRecordStatus } from "@/generated/prisma/client";
import { cancellationPolicy } from "@/config/rental";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { paymentProvider } from "@/server/payments/provider";
import { applyTransition } from "./state";

const HOUR = 60 * 60_000;

type PaymentRow = { kind: PaymentKind; status: PaymentRecordStatus; amountMinor: number };

export type CancellationTerms =
  | { allowed: false }
  | {
      allowed: true;
      /** true: fuld refusion. false: sen annullering med delvis refusion. */
      free: boolean;
      freeUntil: Date;
      paidMinor: number;
      refundMinor: number;
      currency: string;
    };

/** Betalt minus refunderet (også refusioner, der er sat i gang). */
export function paidAmount(payments: PaymentRow[]): number {
  let paid = 0;
  for (const payment of payments) {
    if (payment.kind === "CHARGE" && payment.status === "SUCCEEDED") paid += payment.amountMinor;
    if (payment.kind === "REFUND" && ["PENDING", "SUCCEEDED"].includes(payment.status)) {
      paid -= payment.amountMinor;
    }
  }
  return paid;
}

/**
 * Hvad kunden får tilbage ved annullering nu (05-user-flows.md, E4). Kun en bekræftet booking, der
 * ikke er hentet, kan annulleres online. Vises til kunden, før annulleringen bekræftes.
 */
export function cancellationTerms(
  booking: { status: BookingStatus; pickupAt: Date; currency: string; payments: PaymentRow[] },
  now = new Date(),
): CancellationTerms {
  if (booking.status !== "CONFIRMED" || now >= booking.pickupAt) return { allowed: false };
  const freeUntil = new Date(
    booking.pickupAt.getTime() - cancellationPolicy.freeUntilHoursBefore * HOUR,
  );
  const free = now < freeUntil;
  const paidMinor = Math.max(0, paidAmount(booking.payments));
  const refundMinor = free
    ? paidMinor
    : Math.floor((paidMinor * cancellationPolicy.lateRefundPercent) / 100);
  return { allowed: true, free, freeUntil, paidMinor, refundMinor, currency: booking.currency };
}

const bookingForCancel = {
  status: true,
  pickupAt: true,
  currency: true,
  payments: {
    select: {
      id: true,
      kind: true,
      status: true,
      amountMinor: true,
      provider: true,
      providerRef: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
};

export async function bookingCancellationTerms(bookingId: string, now = new Date()) {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: bookingForCancel,
  });
  return cancellationTerms(booking, now);
}

/**
 * Kunden annullerer: status CANCELLED (bilen frigives), og refusionen registreres i samme
 * transaktion. Selve refusionen hos betalingsudbyderen sker bagefter; fejler den, står
 * refusionen som PENDING, så personalet kan gennemføre den (admin, M10). Annulleringen står ved magt.
 */
export async function cancelBooking(
  bookingId: string,
  options: { actorUserId?: string | null; now?: Date } = {},
): Promise<{ refundMinor: number; currency: string }> {
  const now = options.now ?? new Date();
  const { amounts, refund } = await db.$transaction(async (tx) => {
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: bookingForCancel,
    });
    const terms = cancellationTerms(booking, now);
    if (!terms.allowed) {
      throw new AppError("CONFLICT", "Bookingen kan ikke annulleres online", {
        status: booking.status,
      });
    }
    // Optimistisk lås i applyTransition: to samtidige annulleringer kan ikke begge lykkes.
    await applyTransition(tx, bookingId, "CANCELLED", {
      actorUserId: options.actorUserId ?? null,
      reason: terms.free ? "customer_free" : "customer_late",
      now,
    });

    const charge = booking.payments.find(
      (payment) => payment.kind === "CHARGE" && payment.status === "SUCCEEDED",
    );
    const amounts = {
      paidMinor: terms.paidMinor,
      refundMinor: terms.refundMinor,
      currency: terms.currency,
    };
    if (terms.refundMinor === 0 || !charge?.providerRef) return { amounts, refund: null };
    const refund = await tx.payment.create({
      data: {
        bookingId,
        parentPaymentId: charge.id,
        kind: "REFUND",
        status: "PENDING",
        amountMinor: terms.refundMinor,
        currency: terms.currency,
        provider: charge.provider,
      },
      select: { id: true },
    });
    return { amounts, refund: { id: refund.id, chargeRef: charge.providerRef } };
  });

  if (refund) {
    try {
      const result = await paymentProvider().refund(refund.chargeRef, amounts.refundMinor);
      await db.$transaction([
        db.payment.update({
          where: { id: refund.id },
          data: { status: "SUCCEEDED", providerRef: result.providerRef },
        }),
        db.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus:
              amounts.refundMinor >= amounts.paidMinor ? "REFUNDED" : "PARTIALLY_REFUNDED",
          },
        }),
      ]);
    } catch (error) {
      logger.error({ bookingId, err: error }, "refund failed after cancellation; refund manually");
    }
  }
  logger.info({ bookingId, refundMinor: amounts.refundMinor }, "booking cancelled by customer");
  return { refundMinor: amounts.refundMinor, currency: amounts.currency };
}
