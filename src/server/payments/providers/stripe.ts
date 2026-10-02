import "server-only";
import Stripe from "stripe";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import type { PaymentProvider, ProviderEvent } from "../types";

/**
 * Stripe Payment Element. Betalingsmetoderne (kort, MobilePay, Apple Pay, Google Pay) slås til i
 * Stripe Dashboard; `automatic_payment_methods` viser dem, der passer til kunden.
 */
export function stripeProvider(
  secretKey: string,
  webhookSecret: string | undefined,
): PaymentProvider {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2 });

  return {
    name: "stripe",

    async createPayment(input) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          description: input.description,
          // Kun id og reference; ingen persondata hos Stripe ud over det, kunden selv indtaster.
          metadata: { bookingId: input.bookingId, reference: input.reference },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { providerRef: intent.id, clientSecret: intent.client_secret! };
    },

    async createDeposit(input) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          allowed_payment_method_types: ["card"],
          capture_method: input.captureManually ? "manual" : "automatic",
          description: input.description,
          metadata: { bookingId: input.bookingId, reference: input.reference, deposit: "true" },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { providerRef: intent.id, clientSecret: intent.client_secret! };
    },

    async captureDeposit(providerRef, amountMinor, idempotencyKey) {
      await stripe.paymentIntents.capture(
        providerRef,
        { amount_to_capture: amountMinor },
        { idempotencyKey },
      );
    },

    async releaseDeposit(providerRef, idempotencyKey) {
      await stripe.paymentIntents.cancel(providerRef, {}, { idempotencyKey });
    },

    async clientSecret(providerRef) {
      const intent = await stripe.paymentIntents.retrieve(providerRef);
      const payable = ["requires_payment_method", "requires_confirmation", "requires_action"];
      return payable.includes(intent.status) ? intent.client_secret : null;
    },

    async refund(providerRef, amountMinor, idempotencyKey) {
      const refund = await stripe.refunds.create(
        { payment_intent: providerRef, amount: amountMinor },
        { idempotencyKey },
      );
      return { providerRef: refund.id };
    },

    async parseWebhook(rawBody, signature) {
      if (!webhookSecret)
        throw new AppError("SERVICE_UNAVAILABLE", "STRIPE_WEBHOOK_SECRET mangler");
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret);
      } catch {
        throw new AppError("WEBHOOK_INVALID", "Ugyldig signatur");
      }
      return toProviderEvent(stripe, event);
    },
  };
}

async function toProviderEvent(stripe: Stripe, event: Stripe.Event): Promise<ProviderEvent> {
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    return {
      id: event.id,
      type: "payment.succeeded",
      providerRef: intent.id,
      amountMinor: intent.amount_received,
      currency: intent.currency.toUpperCase(),
      ...(await chargeDetails(stripe, intent)),
    };
  }
  // Et depositum er reserveret på kortet og venter på capture eller frigivelse.
  if (event.type === "payment_intent.amount_capturable_updated") {
    const intent = event.data.object;
    if (intent.status !== "requires_capture") return { id: event.id, type: "ignored" };
    return {
      id: event.id,
      type: "payment.authorized",
      providerRef: intent.id,
      amountMinor: intent.amount_capturable,
      currency: intent.currency.toUpperCase(),
      ...(await chargeDetails(stripe, intent)),
    };
  }
  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    return {
      id: event.id,
      type: "payment.failed",
      providerRef: intent.id,
      failureCode:
        intent.last_payment_error?.decline_code ?? intent.last_payment_error?.code ?? null,
    };
  }
  return { id: event.id, type: "ignored" };
}

/** Metode og kortets brand/sidste 4 cifre. Aldrig mere end det. */
async function chargeDetails(stripe: Stripe, intent: Stripe.PaymentIntent) {
  const chargeId =
    typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  const charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
  const details = charge?.payment_method_details;
  return {
    method: paymentMethod(details),
    cardBrand: details?.card?.brand ?? null,
    cardLast4: details?.card?.last4 ?? null,
  };
}

function paymentMethod(
  details: Stripe.Charge.PaymentMethodDetails | null | undefined,
): PaymentMethod | null {
  if (!details) return null;
  if (details.type === "mobilepay") return "MOBILEPAY";
  if (details.type !== "card") return null;
  const wallet = details.card?.wallet?.type;
  if (wallet === "apple_pay") return "APPLE_PAY";
  if (wallet === "google_pay") return "GOOGLE_PAY";
  return "CARD";
}
