import "server-only";
import type { BookingStatus, NotificationChannel, Prisma } from "@/generated/prisma/client";
import { notificationRules } from "@/config/notifications";
import { whatsappEnabled } from "./channels/whatsapp";
import type { NotificationTemplate } from "./templates";

const HOUR = 60 * 60_000;

type Tx = Prisma.TransactionClient;

/**
 * Transactional outbox (01-systemarkitektur.md, beslutning 5): beskeder skrives som rækker i samme
 * transaktion som hændelsen og sendes bagefter af cron-jobbet. En e-mailfejl kan derfor aldrig
 * rulle en booking tilbage. `dedupeKey` sikrer, at samme besked kun findes én gang.
 *
 * Rækkerne indeholder ingen persondata: navn, bil og tider hentes fra bookingen ved afsendelsen.
 */
export async function queueBookingNotification(
  tx: Tx,
  bookingId: string,
  template: NotificationTemplate,
  /** `dedupeSuffix`: skabeloner, der kan sendes flere gange (fx én pr. ændring eller betaling). */
  options: { scheduledAt?: Date; now?: Date; dedupeSuffix?: string } = {},
) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { customerId: true, locale: true, customer: { select: { phoneE164: true } } },
  });
  const channels: NotificationChannel[] = ["EMAIL"];
  if (booking.customer.phoneE164 && whatsappEnabled()) channels.push("WHATSAPP");

  const now = options.now ?? new Date();
  const scheduledAt = options.scheduledAt && options.scheduledAt > now ? options.scheduledAt : now;
  await tx.notification.createMany({
    data: channels.map((channel) => ({
      bookingId,
      customerId: booking.customerId,
      template,
      channel,
      locale: booking.locale,
      payload: {},
      scheduledAt,
      nextAttemptAt: scheduledAt,
      dedupeKey: [template, bookingId, channel, options.dedupeSuffix].filter(Boolean).join(":"),
    })),
    skipDuplicates: true,
  });
}

/**
 * Beskeder, der følger af et statusskift. Kaldes fra `applyTransition`, så alle veje til en
 * status (webhook, admin, cron) giver de samme beskeder.
 */
export async function queueForTransition(
  tx: Tx,
  booking: { id: string; pickupAt: Date; returnAt: Date },
  from: BookingStatus,
  to: BookingStatus,
  now = new Date(),
) {
  if (to === "CONFIRMED") {
    await queueBookingNotification(tx, booking.id, "BOOKING_CONFIRMED", { now });
    const pickupReminder = new Date(
      booking.pickupAt.getTime() - notificationRules.pickupReminderHoursBefore * HOUR,
    );
    // En booking tæt på afhentning har lige fået bekræftelsen; en påmindelse er overflødig.
    if (pickupReminder > now) {
      await queueBookingNotification(tx, booking.id, "PICKUP_REMINDER", {
        scheduledAt: pickupReminder,
        now,
      });
    }
    await queueBookingNotification(tx, booking.id, "RETURN_REMINDER", {
      scheduledAt: new Date(
        booking.returnAt.getTime() - notificationRules.returnReminderHoursBefore * HOUR,
      ),
      now,
    });
  }
  // Kun en bekræftet booking får kvittering; en ubetalt reservation, der annulleres, gør ikke.
  if (to === "CANCELLED" && from === "CONFIRMED") {
    await queueBookingNotification(tx, booking.id, "BOOKING_CANCELLED", { now });
  }
  if (to === "COMPLETED") {
    await queueBookingNotification(tx, booking.id, "THANK_YOU", { now });
    await queueBookingNotification(tx, booking.id, "REVIEW_REQUEST", {
      scheduledAt: new Date(now.getTime() + notificationRules.reviewRequestHoursAfter * HOUR),
      now,
    });
  }
}
