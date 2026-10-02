import "server-only";
import { serverEnv } from "@/lib/env";
import type { NotificationTemplate } from "../templates";

/**
 * WhatsApp Cloud API (Meta). Slås til, når WHATSAPP_TOKEN og WHATSAPP_PHONE_NUMBER_ID er sat,
 * dvs. når Meta har godkendt virksomheden og beskedskabelonerne. Indtil da sendes kun e-mail.
 *
 * Automatiske beskeder skal være godkendte skabeloner hos Meta. Navnene herunder skal oprettes i
 * WhatsApp Manager med samme navn og variabler i samme rækkefølge (se README).
 */
const GRAPH_URL = "https://graph.facebook.com/v21.0";

export const whatsappTemplateNames: Record<NotificationTemplate, string> = {
  BOOKING_CONFIRMED: "booking_confirmed",
  PAYMENT_RECEIVED: "payment_received",
  CAR_READY: "car_ready",
  PICKUP_REMINDER: "pickup_reminder",
  RETURN_REMINDER: "return_reminder",
  THANK_YOU: "thank_you",
  REVIEW_REQUEST: "review_request",
  BOOKING_CANCELLED: "booking_cancelled",
};

export function whatsappEnabled(): boolean {
  const env = serverEnv();
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export type WhatsAppMessage = {
  /** E.164, fx +4512345678. */
  to: string;
  template: NotificationTemplate;
  locale: string;
  /** Skabelonens variabler {{1}}, {{2}} … i rækkefølge. */
  parameters: string[];
};

export async function sendWhatsApp(
  message: WhatsAppMessage,
): Promise<{ providerMessageId: string }> {
  const env = serverEnv();
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp er ikke sat op");
  }
  const response = await fetch(`${GRAPH_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: message.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: whatsappTemplateNames[message.template],
        language: { code: message.locale },
        components: [
          {
            type: "body",
            parameters: message.parameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });
  if (!response.ok) throw new Error(`WhatsApp svarede ${response.status}`);
  const body = (await response.json()) as { messages?: { id: string }[] };
  return { providerMessageId: body.messages?.[0]?.id ?? "" };
}
