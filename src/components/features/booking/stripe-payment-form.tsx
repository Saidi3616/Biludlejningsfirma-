"use client";

import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

let stripePromise: Promise<Stripe | null> | null = null;

function getStripe(publishableKey: string) {
  stripePromise ??= loadStripe(publishableKey);
  return stripePromise;
}

/**
 * Stripe Payment Element: kort, MobilePay, Apple Pay og Google Pay efter opsætningen i Stripe.
 * Kortdata går direkte til Stripe og rører aldrig vores server. Efter betaling sender Stripe
 * kunden til bekræftelsessiden; bookingen bekræftes af webhooken.
 */
export function StripePaymentForm({
  publishableKey,
  clientSecret,
  returnUrl,
  payLabel,
}: {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  payLabel: string;
}) {
  const locale = useLocale();
  return (
    <Elements
      stripe={getStripe(publishableKey)}
      options={{
        clientSecret,
        locale: locale as "da" | "en" | "fr" | "ar",
        appearance: { theme: "stripe", variables: { fontFamily: "inherit", borderRadius: "8px" } },
      }}
    >
      <CheckoutForm returnUrl={returnUrl} payLabel={payLabel} />
    </Elements>
  );
}

function CheckoutForm({ returnUrl, payLabel }: { returnUrl: string; payLabel: string }) {
  const t = useTranslations("booking.pay");
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    // Kommer kun hertil ved en fejl; ellers sender Stripe kunden videre.
    setError(result.error?.message ?? t("failed"));
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <PaymentElement options={{ layout: "accordion" }} />
      <Button type="submit" variant="cta" size="lg" loading={pending} disabled={!stripe}>
        <Lock aria-hidden />
        {payLabel}
      </Button>
    </form>
  );
}
