import "server-only";
import { db } from "@/server/db";

/**
 * Ubetalte reservationer, hvis frist er overskredet, bliver EXPIRED, så bilen frigives.
 * Køres hvert minut af cron og desuden lige før en ny booking oprettes.
 * Sikker at køre samtidig: en række, der allerede er udløbet, matcher ikke igen.
 */
export async function expireReservations(now = new Date()): Promise<number> {
  return db.$transaction(async (tx) => {
    const expired = await tx.booking.updateManyAndReturn({
      where: { status: "PENDING_PAYMENT", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
      select: { id: true },
    });
    if (expired.length > 0) {
      await tx.bookingStatusEvent.createMany({
        data: expired.map(({ id }) => ({
          bookingId: id,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "EXPIRED",
          reason: "reservation_expired",
        })),
      });
    }
    return expired.length;
  });
}
