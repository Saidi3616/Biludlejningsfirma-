import type { PaymentMethod } from "@/generated/prisma/enums";

/**
 * Betalingsudbyderen bag et interface (01-systemarkitektur.md, princip 5), så Stripe kan skiftes
 * ud eller simuleres i tests.
 */
export interface PaymentProvider {
  readonly name: "stripe" | "fake";
  /** Opretter en betaling. Samme `idempotencyKey` giver samme betaling hos udbyderen. */
  createPayment(input: CreatePaymentInput): Promise<{ providerRef: string; clientSecret: string }>;
  /**
   * Depositum ved udlevering, kun med kort (MobilePay kan ikke reservere, K6). Med
   * `captureManually` reserveres beløbet; ellers trækkes det (lange lejer) og refunderes bagefter.
   */
  createDeposit(
    input: CreatePaymentInput & { captureManually: boolean },
  ): Promise<{ providerRef: string; clientSecret: string }>;
  /** Trækker (en del af) en reservation. Resten frigives automatisk hos udbyderen. */
  captureDeposit(providerRef: string, amountMinor: number, idempotencyKey: string): Promise<void>;
  /** Frigiver hele reservationen. */
  releaseDeposit(providerRef: string, idempotencyKey: string): Promise<void>;
  /** Klient-hemmeligheden til en eksisterende, ubetalt betaling (gemmes ikke i databasen). */
  clientSecret(providerRef: string): Promise<string | null>;
  /**
   * Refunderer (dele af) en betaling. Samme `idempotencyKey` giver samme refusion hos udbyderen,
   * så et nyt forsøg efter en fejl aldrig refunderer to gange.
   */
  refund(
    providerRef: string,
    amountMinor: number,
    idempotencyKey: string,
  ): Promise<{ providerRef: string }>;
  /** Verificerer signaturen og oversætter eventet. Kaster WEBHOOK_INVALID ved forkert signatur. */
  parseWebhook(rawBody: string, signature: string | null): Promise<ProviderEvent>;
}

export type CreatePaymentInput = {
  bookingId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  description: string;
};

/** Udbyderens event i vores eget format. Kun det, vi bruger, og aldrig kortdata. */
export type ProviderEvent =
  | {
      id: string;
      type: "payment.succeeded";
      providerRef: string;
      amountMinor: number;
      currency: string;
      method: PaymentMethod | null;
      cardBrand: string | null;
      cardLast4: string | null;
    }
  | {
      id: string;
      /** Beløbet er reserveret på kortet (depositum med manuel capture). */
      type: "payment.authorized";
      providerRef: string;
      amountMinor: number;
      currency: string;
      method: PaymentMethod | null;
      cardBrand: string | null;
      cardLast4: string | null;
    }
  | { id: string; type: "payment.failed"; providerRef: string; failureCode: string | null }
  | { id: string; type: "ignored" };
