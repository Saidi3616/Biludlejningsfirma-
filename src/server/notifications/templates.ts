import type { BookingStatus } from "@/generated/prisma/enums";

/**
 * De 7 automatiske beskeder (kravspecifikationen) plus kvittering for annullering (E4). Hver skabelon sendes kun, hvis bookingen
 * stadig har en af de tilladte statusser, når den skal afsendes; ellers springes den over.
 */
export const notificationTemplates = {
  /** Booking bekræftet; ved onlinebetaling er det også kvitteringen. */
  BOOKING_CONFIRMED: { statuses: ["CONFIRMED", "ACTIVE", "COMPLETED"] },
  /** Betaling modtaget separat fra bookingen (betalingslink eller skranke, M10). */
  PAYMENT_RECEIVED: { statuses: ["CONFIRMED", "ACTIVE", "COMPLETED"] },
  /** Staff har gjort bilen klar (M11). */
  CAR_READY: { statuses: ["CONFIRMED"] },
  PICKUP_REMINDER: { statuses: ["CONFIRMED"] },
  // Også CONFIRMED, indtil udlevering registreres i admin (M11).
  RETURN_REMINDER: { statuses: ["CONFIRMED", "ACTIVE"] },
  THANK_YOU: { statuses: ["COMPLETED"] },
  REVIEW_REQUEST: { statuses: ["COMPLETED"] },
  /** Kvittering for annullering med refusionsbeløb (05-user-flows.md, E4). */
  BOOKING_CANCELLED: { statuses: ["CANCELLED"] },
} satisfies Record<string, { statuses: BookingStatus[] }>;

export type NotificationTemplate = keyof typeof notificationTemplates;

export function isNotificationTemplate(value: string): value is NotificationTemplate {
  return value in notificationTemplates;
}
