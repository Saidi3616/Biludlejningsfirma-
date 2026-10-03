import "server-only";
import type { NotificationStatus } from "@/generated/prisma/client";
import { notificationRules } from "@/config/notifications";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { receivedMinor, refundedMinor } from "@/lib/payments";
import { getSiteContact } from "@/server/settings";
import { manageTokenFor, reviewTokenFor } from "@/server/booking/tokens";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { sendWhatsApp, whatsappEnabled } from "./channels/whatsapp";
import { renderNotification, type NotificationContext } from "./render";
import { isNotificationTemplate, notificationTemplates } from "./templates";

const MINUTE = 60_000;

export type DispatchResult = Record<"sent" | "retry" | "failed" | "skipped", number>;

/**
 * Sender de beskeder i udbakken, der er forfaldne (cron hvert minut). Rækkerne "lejes" med
 * FOR UPDATE SKIP LOCKED, så to samtidige kørsler aldrig sender den samme besked. En kørsel, der
 * går ned midt i en afsendelse, frigiver rækken, når lejen udløber.
 */
export async function sendDueNotifications(
  options: { now?: Date; limit?: number } = {},
): Promise<DispatchResult> {
  const now = options.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + notificationRules.leaseMinutes * MINUTE);
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Notification" SET "status" = 'SENDING', "nextAttemptAt" = ${leaseUntil}
    WHERE "id" IN (
      SELECT "id" FROM "Notification"
      WHERE "status" IN ('PENDING', 'SENDING')
        AND "nextAttemptAt" <= ${now} AND "scheduledAt" <= ${now}
      ORDER BY "nextAttemptAt"
      LIMIT ${options.limit ?? notificationRules.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;

  const result: DispatchResult = { sent: 0, retry: 0, failed: 0, skipped: 0 };
  for (const { id } of claimed) result[await deliver(id, now)] += 1;
  return result;
}

async function deliver(id: string, now: Date): Promise<keyof DispatchResult> {
  const notification = await db.notification.findUniqueOrThrow({
    where: { id },
    include: {
      booking: {
        include: {
          customer: true,
          carModel: { select: { brand: true, model: true } },
          pickupLocation: true,
          returnLocation: true,
          payments: { select: { kind: true, status: true, amountMinor: true } },
        },
      },
    },
  });
  const { booking, template } = notification;

  const finish = async (status: NotificationStatus, data: Record<string, unknown> = {}) => {
    await db.notification.update({ where: { id }, data: { status, ...data } });
  };

  if (!isNotificationTemplate(template) || !booking) {
    await finish("FAILED", { lastError: "Ukendt skabelon eller booking" });
    return "failed";
  }
  const allowed: readonly string[] = notificationTemplates[template].statuses;
  const phone = booking.customer.phoneE164;
  if (
    !allowed.includes(booking.status) ||
    booking.customer.anonymizedAt ||
    (notification.channel === "WHATSAPP" && (!phone || !whatsappEnabled())) ||
    notification.channel === "SMS"
  ) {
    await finish("SKIPPED");
    return "skipped";
  }

  // Gæster får deres "administrér booking"-link; kunder med konto går via login.
  const manage = manageTokenFor(booking.reference);
  const managePath: `/${string}` =
    booking.manageTokenHash === manage.hash
      ? `/booking/manage/${manage.token}`
      : `/account/bookings/${booking.reference}`;
  const context: NotificationContext = {
    managePath,
    reviewToken: reviewTokenFor(booking.reference),
    reference: booking.reference,
    firstName: booking.customer.firstName,
    email: booking.customer.email,
    carName: `${booking.carModel.brand} ${booking.carModel.model}`,
    pickupAt: booking.pickupAt,
    returnAt: booking.returnAt,
    pickupLocation: booking.pickupLocation,
    returnLocation: booking.returnLocation,
    deliveryAddress: booking.deliveryAddress,
    totalMinor: booking.totalMinor,
    paidMinor: receivedMinor(booking.payments),
    refundMinor: refundedMinor(booking.payments),
    depositMinor: booking.depositMinor,
    expiresAt: booking.expiresAt,
    currency: booking.currency,
    whatsappNumber: (await getSiteContact()).whatsappNumber,
  };
  const locale = hasLocale(routing.locales, notification.locale)
    ? notification.locale
    : routing.defaultLocale;
  const env = serverEnv();
  const baseUrl = env.AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const attempts = notification.attempts + 1;
  try {
    const rendered = renderNotification(template, locale, context, baseUrl);
    let providerMessageId: string | null = null;
    if (notification.channel === "WHATSAPP") {
      ({ providerMessageId } = await sendWhatsApp({
        to: phone!,
        template,
        locale,
        parameters: rendered.whatsappParameters,
      }));
    } else {
      await sendEmail(rendered.email);
    }
    await finish("SENT", { attempts, sentAt: now, providerMessageId, lastError: null });
    logger.info(
      { notificationId: id, template, channel: notification.channel },
      "notification sent",
    );
    return "sent";
  } catch (error) {
    // Kun fejlbeskeden gemmes (forkortet); modtager og indhold logges ikke.
    const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    if (attempts >= notificationRules.maxAttempts) {
      await finish("FAILED", { attempts, lastError });
      logger.error(
        { notificationId: id, template, channel: notification.channel, attempts },
        "notification failed permanently",
      );
      return "failed";
    }
    const waitMinutes =
      notificationRules.backoffMinutes[attempts - 1] ?? notificationRules.backoffMinutes.at(-1)!;
    await finish("PENDING", {
      attempts,
      lastError,
      nextAttemptAt: new Date(now.getTime() + waitMinutes * MINUTE),
    });
    logger.warn({ notificationId: id, template, attempts }, "notification failed, will retry");
    return "retry";
  }
}
