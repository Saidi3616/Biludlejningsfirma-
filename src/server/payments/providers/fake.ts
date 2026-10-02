import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { PaymentProvider, ProviderEvent } from "../types";

/**
 * Simuleret betaling til lokal udvikling og CI, så hele flowet kan testes uden Stripe-nøgler.
 * Bruges aldrig i production (se provider.ts). Events signeres som hos Stripe og går gennem samme
 * webhook-behandling som rigtige betalinger.
 */
const secret = randomBytes(32).toString("hex");

export type FakeOutcome = "succeeded" | "failed";

export const fakeProvider: PaymentProvider & {
  signedEvent(
    providerRef: string,
    outcome: FakeOutcome,
    amountMinor: number,
    currency: string,
  ): {
    body: string;
    signature: string;
  };
} = {
  name: "fake",

  async createPayment(input) {
    // Deterministisk ud fra idempotency-nøglen, som hos Stripe.
    const providerRef = `fake_pi_${createHmac("sha256", "fake").update(input.idempotencyKey).digest("hex").slice(0, 24)}`;
    return { providerRef, clientSecret: `${providerRef}_secret` };
  },

  async clientSecret(providerRef) {
    return `${providerRef}_secret`;
  },

  async refund(providerRef) {
    return { providerRef: `fake_re_${providerRef.slice(-12)}` };
  },

  async parseWebhook(rawBody, signature) {
    const expected = sign(rawBody);
    if (
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new AppError("WEBHOOK_INVALID", "Ugyldig signatur");
    }
    return JSON.parse(rawBody) as ProviderEvent;
  },

  signedEvent(providerRef, outcome, amountMinor, currency) {
    const id = `fake_evt_${randomBytes(8).toString("hex")}`;
    const event: ProviderEvent =
      outcome === "succeeded"
        ? {
            id,
            type: "payment.succeeded",
            providerRef,
            amountMinor,
            currency,
            method: "CARD",
            cardBrand: "visa",
            cardLast4: "4242",
          }
        : { id, type: "payment.failed", providerRef, failureCode: "card_declined" };
    const body = JSON.stringify(event);
    return { body, signature: sign(body) };
  },
};

function sign(body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}
