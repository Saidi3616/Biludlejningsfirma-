import "server-only";
import type {
  BookingStatus,
  PaymentKind,
  PaymentRecordStatus,
  Prisma,
} from "@/generated/prisma/client";
import { cancellationPolicy } from "@/config/rental";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { netPaidMinor } from "@/lib/payments";
import { db } from "@/server/db";
import { planRefunds, processRefunds } from "@/server/payments/refunds";
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
  const paidMinor = Math.max(0, netPaidMinor(booking.payments));
  const refundMinor = free
    ? paidMinor
    : Math.floor((paidMinor * cancellationPolicy.lateRefundPercent) / 100);
  return { allowed: true, free, freeUntil, paidMinor, refundMinor, currency: booking.currency };
}

const bookingForCancel = {
  status: true,
  pickupAt: true,
  currency: true,
  payments: { select: { kind: true, status: true, amountMinor: true } },
} satisfies Prisma.BookingSelect;

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
 * refusionen som PENDING, så personalet kan gennemføre den fra admin. Annulleringen står ved magt.
 */
export async function cancelBooking(
  bookingId: string,
  options: { actorUserId?: string | null; now?: Date } = {},
): Promise<{ refundMinor: number; currency: string }> {
  const now = options.now ?? new Date();
  const result = await cancelWithRefund(bookingId, {
    actorUserId: options.actorUserId ?? null,
    now,
    decide: (booking) => {
      const terms = cancellationTerms(booking, now);
      if (!terms.allowed) {
        throw new AppError("CONFLICT", "Bookingen kan ikke annulleres online", {
          status: booking.status,
        });
      }
      return {
        refundMinor: terms.refundMinor,
        reason: terms.free ? "customer_free" : "customer_late",
      };
    },
  });
  logger.info({ bookingId, refundMinor: result.refundMinor }, "booking cancelled by customer");
  return result;
}

export type CancelBooking = Prisma.BookingGetPayload<{ select: typeof bookingForCancel }>;

/**
 * Fælles for kundens og personalets annullering: `decide` får bookingen (læst i transaktionen) og
 * afgør refusionsbeløb og årsag eller kaster. Status, statushændelse, kvittering til kunden og
 * refusionsrækker skrives i én transaktion; refusionen hos udbyderen gennemføres bagefter.
 */
export async function cancelWithRefund(
  bookingId: string,
  options: {
    actorUserId: string | null;
    now: Date;
    decide: (booking: CancelBooking) => { refundMinor: number; reason: string };
    /** Ekstra skrivninger i samme transaktion (fx audit-log fra admin). */
    after?: (tx: Prisma.TransactionClient, refundMinor: number) => Promise<void>;
  },
): Promise<{ refundMinor: number; currency: string; refundsFailed: number }> {
  const { refundMinor, currency, planned } = await db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: bookingForCancel,
    });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    const { refundMinor, reason } = options.decide(booking);
    // Optimistisk lås i applyTransition: to samtidige annulleringer kan ikke begge lykkes.
    await applyTransition(tx, bookingId, "CANCELLED", {
      actorUserId: options.actorUserId,
      reason,
      now: options.now,
    });
    const planned = await planRefunds(tx, bookingId, refundMinor, {
      actorUserId: options.actorUserId,
    });
    await options.after?.(tx, refundMinor);
    return { refundMinor, currency: booking.currency, planned };
  });
  const refundsFailed = await processRefunds(bookingId, planned);
  return { refundMinor, currency, refundsFailed };
}
