import "server-only";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fakeProvider } from "./providers/fake";
import { stripeProvider } from "./providers/stripe";
import type { PaymentProvider } from "./types";

let cached: PaymentProvider | undefined;

/**
 * Stripe, når STRIPE_SECRET_KEY er sat. Ellers den simulerede udbyder, men kun når FAKE_PAYMENTS=true
 * og APP_ENV er local: på staging og production uden nøgle kan der ikke betales.
 */
export function paymentProvider(): PaymentProvider {
  if (cached) return cached;
  const env = serverEnv();
  if (env.STRIPE_SECRET_KEY) {
    cached = stripeProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  } else if (fakePaymentsAllowed()) {
    cached = fakeProvider;
  } else {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Betaling er ikke sat op (STRIPE_SECRET_KEY mangler)",
    );
  }
  return cached;
}

export function fakePaymentsAllowed(): boolean {
  const env = serverEnv();
  return !env.STRIPE_SECRET_KEY && env.FAKE_PAYMENTS === "true" && env.APP_ENV === "local";
}
