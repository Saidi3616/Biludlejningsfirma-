import "server-only";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { site } from "@/config/site";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { renderEmail } from "@/server/email/layout";
import { sendEmail } from "@/server/email/send";
import { notificationTranslator } from "@/server/notifications/render";

export const customerMessageSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export type CustomerMessageField = keyof z.input<typeof customerMessageSchema>;

/**
 * "Send besked" fra admin (06-admin-flows.md, kerneopgave 9): en e-mail med fri tekst i det
 * fælles layout. Beskeden gemmes i kommunikationsloggen (Message) på kunden og bookingen.
 * WhatsApp sker via knappen på bookingen (wa.me), indtil Cloud API'en er godkendt.
 */
export async function sendCustomerMessage(
  ctx: PolicyContext,
  target: { bookingId: string },
  input: Record<string, unknown>,
) {
  assertCan(ctx, "message:send");
  const parsed = customerMessageSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Ugyldige felter", {
      fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))],
    });
  }
  const booking = await db.booking.findUnique({
    where: { id: target.bookingId },
    select: {
      id: true,
      locale: true,
      customer: { select: { id: true, firstName: true, email: true, anonymizedAt: true } },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  if (booking.customer.anonymizedAt) throw new AppError("CONFLICT", "Kunden er anonymiseret");

  const { subject, body } = parsed.data;
  const locale = hasLocale(routing.locales, booking.locale)
    ? booking.locale
    : routing.defaultLocale;
  const t = notificationTranslator(locale);
  const paragraphs = body.split(/\n\s*\n/).map((paragraph) => paragraph.trim());
  const { html, text } = renderEmail({
    locale,
    preheader: paragraphs[0] ?? subject,
    heading: subject,
    greeting: t("common.greeting", { name: booking.customer.firstName }),
    paragraphs,
    closing: [],
    signature: t("common.signature", { company: site.name }),
    footer: t("common.footer", { company: site.name }),
  });

  await sendEmail({ to: booking.customer.email, subject, html, text });
  const message = await db.message.create({
    data: {
      customerId: booking.customer.id,
      bookingId: booking.id,
      direction: "OUTBOUND",
      channel: "EMAIL",
      email: booking.customer.email,
      subject,
      body,
      status: "ANSWERED",
      assignedUserId: ctx.actor.userId,
    },
    select: { id: true },
  });
  await audit(db, {
    actorUserId: ctx.actor.userId,
    action: "message.send",
    entityType: "Booking",
    entityId: booking.id,
    diff: { messageId: message.id, channel: "EMAIL" },
  });
  logger.info({ bookingId: booking.id, messageId: message.id }, "message sent to customer");
}
