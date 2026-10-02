import "server-only";
import type { BookingStatus } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { db } from "@/server/db";
import { isCarUnavailableError } from "@/server/db-errors";

/**
 * Bookingens livscyklus (01-systemarkitektur.md). Betalingsstatus er et separat felt.
 * EXPIRED → CONFIRMED: en betaling landede efter fristen, og bilen er stadig ledig.
 */
const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["ACTIVE", "CANCELLED", "NO_SHOW"],
  ACTIVE: ["COMPLETED"],
  EXPIRED: ["CONFIRMED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return transitions[from].includes(to);
}

/**
 * Skifter status og skriver en BOOKING_STATUS_EVENT i samme transaktion.
 * Opdateringen kræver, at status stadig er den, vi læste (optimistisk lås), så to samtidige
 * skift ikke begge lykkes. Adgangskontrol ligger hos kalderen (policies).
 */
export async function transitionBooking(
  bookingId: string,
  to: BookingStatus,
  options: { actorUserId?: string | null; reason?: string } = {},
) {
  try {
    return await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { status: true },
      });
      if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
      if (!canTransition(booking.status, to)) {
        throw new AppError("CONFLICT", "Bookingen kan ikke skifte til den status", {
          from: booking.status,
          to,
        });
      }

      const updated = await tx.booking.updateMany({
        where: { id: bookingId, status: booking.status },
        data: { status: to, ...(to === "CONFIRMED" ? { expiresAt: null } : {}) },
      });
      if (updated.count === 0) {
        throw new AppError("CONFLICT", "Bookingen blev ændret samtidig", { to });
      }

      await tx.bookingStatusEvent.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: to,
          actorUserId: options.actorUserId ?? null,
          reason: options.reason ?? null,
        },
      });
      return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    });
  } catch (error) {
    // Kun muligt ved EXPIRED → CONFIRMED: bilen er taget i mellemtiden.
    if (isCarUnavailableError(error)) {
      throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen er ikke længere ledig");
    }
    throw error;
  }
}
