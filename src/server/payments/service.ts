import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { applyTransition } from "@/server/booking/state";
import { db } from "@/server/db";
import { isCarUnavailableError, violatedConstraint } from "@/server/db-errors";
import { paymentProvider } from "./provider";
import type { ProviderEvent } from "./types";

type SucceededEvent = Extract<ProviderEvent, { type: "payment.succeeded" }>;
type FailedEvent = Extract<ProviderEvent, { type: "payment.failed" }>;

/** Bookingen kan ikke bekræftes (fx annulleret), så betalingen skal refunderes. */
class CannotConfirm extends Error {}

export type StartedPayment = {
  provider: "stripe" | "fake";
  clientSecret: string;
  amountMinor: number;
  currency: string;
};

/**
 * Starter (eller genoptager) betalingen af en reservation og giver klient-hemmeligheden til
 * betalingsformularen. Beløbet er bookingens total, beregnet på serveren ved oprettelsen.
 * Selve bekræftelsen sker kun via webhook: klienten kan aldrig markere en booking som betalt.
 */
export async function startPayment(bookingId: string, now = new Date()): Promise<StartedPayment> {
  const provider = paymentProvider();
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { payments: { where: { kind: "CHARGE" }, orderBy: { createdAt: "desc" } } },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  if (booking.paymentStatus === "PAID") {
    throw new AppError("CONFLICT", "Bookingen er allerede betalt");
  }
  if (
    booking.status !== "PENDING_PAYMENT" ||
    !booking.expiresAt ||
    booking.expiresAt.getTime() <= now.getTime()
  ) {
    throw new AppError("RESERVATION_EXPIRED", "Reservationen er udløbet");
  }

  const result = (clientSecret: string): StartedPayment => ({
    provider: provider.name,
    clientSecret,
    amountMinor: booking.totalMinor,
    currency: booking.currency,
  });

  // Genbrug en åben betaling med samme beløb (fx efter et afvist kort eller en genindlæsning).
  const open = booking.payments.find(
    (payment) =>
      payment.provider === provider.name &&
      payment.providerRef &&
      payment.amountMinor === booking.totalMinor &&
      payment.status !== "SUCCEEDED" &&
      payment.status !== "CANCELLED",
  );
  if (open) {
    const clientSecret = await provider.clientSecret(open.providerRef!);
    if (clientSecret) return result(clientSecret);
  }

  // Samme nøgle ved samtidige kald giver samme betaling hos udbyderen og kun én række her.
  const created = await provider.createPayment({
    bookingId: booking.id,
    reference: booking.reference,
    amountMinor: booking.totalMinor,
    currency: booking.currency,
    idempotencyKey: `booking:${booking.id}:charge:${booking.payments.length}`,
    description: `Booking ${booking.reference}`,
  });
  try {
    await db.payment.create({
      data: {
        bookingId: booking.id,
        kind: "CHARGE",
        status: "PENDING",
        amountMinor: booking.totalMinor,
        currency: booking.currency,
        provider: provider.name,
        providerRef: created.providerRef,
      },
    });
  } catch (error) {
    if (violatedConstraint(error) !== "Payment_providerRef_key") throw error;
  }
  logger.info({ bookingId: booking.id, provider: provider.name }, "payment started");
  return result(created.clientSecret);
}

export type WebhookResult = "processed" | "duplicate" | "ignored" | "refunded";

/**
 * Behandler et webhook-event fra betalingsudbyderen (07-api.md):
 * verificér signatur → gem event-id i ProcessedWebhook → behandl i samme transaktion.
 * Samme event to gange giver ingen dubletter. Fejler behandlingen, rulles alt tilbage, og
 * udbyderen sender eventet igen.
 */
export async function handlePaymentWebhook(
  rawBody: string,
  signature: string | null,
): Promise<WebhookResult> {
  const provider = paymentProvider();
  const event = await provider.parseWebhook(rawBody, signature);

  try {
    return await db.$transaction(async (tx) => {
      if (!(await markProcessed(tx, event.id, provider.name))) return "duplicate";
      if (event.type === "payment.succeeded") return applySucceeded(tx, event);
      if (event.type === "payment.failed") return applyFailed(tx, event);
      return "ignored";
    });
  } catch (error) {
    // Betalingen landede på en annulleret booking eller en udløbet reservation, hvis bil er taget.
    if (
      event.type === "payment.succeeded" &&
      (error instanceof CannotConfirm || isCarUnavailableError(error))
    ) {
      return refundUnconfirmable(event, provider.name);
    }
    throw error;
  }
}

/** false hvis eventet allerede er behandlet. Samtidige leveringer venter på hinanden her. */
async function markProcessed(tx: Prisma.TransactionClient, eventId: string, provider: string) {
  const inserted = await tx.processedWebhook.createMany({
    data: [{ providerEventId: eventId, provider }],
    skipDuplicates: true,
  });
  return inserted.count === 1;
}

async function findPayment(tx: Prisma.TransactionClient, providerRef: string) {
  const payment = await tx.payment.findUnique({
    where: { providerRef },
    include: { booking: true },
  });
  if (!payment) logger.warn({ providerRef }, "webhook for unknown payment");
  return payment;
}

async function applySucceeded(
  tx: Prisma.TransactionClient,
  event: SucceededEvent,
): Promise<WebhookResult> {
  const payment = await findPayment(tx, event.providerRef);
  if (!payment || payment.status === "SUCCEEDED") return "ignored";
  const { booking } = payment;
  if (event.amountMinor !== payment.amountMinor) {
    logger.error(
      { bookingId: booking.id, expected: payment.amountMinor, received: event.amountMinor },
      "payment amount mismatch",
    );
  }

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

  // Kun en ventende eller udløbet reservation kan bekræftes; en annulleret refunderes.
  if (booking.status !== "PENDING_PAYMENT" && booking.status !== "EXPIRED") {
    throw new CannotConfirm(booking.status);
  }
  await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID" } });
  await applyTransition(tx, booking.id, "CONFIRMED", {
    reason: booking.status === "EXPIRED" ? "Betaling modtaget efter fristen" : "Betaling modtaget",
  });

  if (booking.discountId && booking.discountMinor > 0) {
    await tx.discountRedemption.createMany({
      data: [
        {
          discountId: booking.discountId,
          bookingId: booking.id,
          customerId: booking.customerId,
          amountMinor: booking.discountMinor,
        },
      ],
      skipDuplicates: true,
    });
  }
  logger.info(
    { bookingId: booking.id, reference: booking.reference },
    "booking paid and confirmed",
  );
  return "processed";
}

async function applyFailed(
  tx: Prisma.TransactionClient,
  event: FailedEvent,
): Promise<WebhookResult> {
  const payment = await findPayment(tx, event.providerRef);
  if (!payment || payment.status === "SUCCEEDED") return "ignored";
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED", failureCode: event.failureCode },
  });
  // Reservationen holdes til udløb, så kunden kan prøve igen.
  if (payment.booking.paymentStatus === "UNPAID") {
    await tx.booking.update({
      where: { id: payment.bookingId },
      data: { paymentStatus: "FAILED" },
    });
  }
  logger.info({ bookingId: payment.bookingId, failureCode: event.failureCode }, "payment failed");
  return "processed";
}

/**
 * Pengene er trukket, men bookingen kan ikke bekræftes (annulleret, eller bilen er taget efter
 * udløb).
 * Betalingen registreres og refunderes fuldt (01-systemarkitektur.md, beslutning 2).
 */
async function refundUnconfirmable(
  event: SucceededEvent,
  provider: string,
): Promise<WebhookResult> {
  const payment = await db.$transaction(async (tx) => {
    if (!(await markProcessed(tx, event.id, provider))) return null;
    const found = await findPayment(tx, event.providerRef);
    if (!found || found.status === "SUCCEEDED") return null;
    return tx.payment.update({
      where: { id: found.id },
      data: {
        status: "SUCCEEDED",
        method: event.method,
        cardBrand: event.cardBrand,
        cardLast4: event.cardLast4,
      },
    });
  });
  if (!payment) return "duplicate";

  const refund = await paymentProvider().refund(
    event.providerRef,
    event.amountMinor,
    `refund:${event.providerRef}:unconfirmable`,
  );
  await db.$transaction([
    db.payment.create({
      data: {
        bookingId: payment.bookingId,
        parentPaymentId: payment.id,
        kind: "REFUND",
        status: "SUCCEEDED",
        amountMinor: event.amountMinor,
        currency: event.currency,
        provider,
        providerRef: refund.providerRef,
      },
    }),
    db.booking.update({ where: { id: payment.bookingId }, data: { paymentStatus: "REFUNDED" } }),
  ]);
  logger.warn({ bookingId: payment.bookingId }, "payment refunded: booking cannot be confirmed");
  return "refunded";
}
