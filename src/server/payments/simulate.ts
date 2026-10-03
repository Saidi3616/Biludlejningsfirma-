import "server-only";
import { AppError } from "@/lib/errors";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { startDeposit } from "./deposits";
import { fakePaymentsAllowed, paymentProvider } from "./provider";
import { fakeProvider, type FakeOutcome } from "./providers/fake";
import { handlePaymentWebhook, startPayment } from "./service";

/**
 * Testbetaling uden Stripe (kun lokalt og i CI, se provider.ts). Sender et signeret event gennem
 * præcis samme webhook-behandling, som Stripe ville.
 */
export async function simulatePayment(bookingId: string, outcome: FakeOutcome) {
  if (!fakePaymentsAllowed() || paymentProvider().name !== "fake") {
    throw new AppError("FORBIDDEN", "Testbetaling er slået fra");
  }
  await startPayment(bookingId);
  const payment = await db.payment.findFirstOrThrow({
    where: { bookingId, kind: "CHARGE", provider: "fake", status: { in: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "desc" },
  });
  const { body, signature } = fakeProvider.signedEvent(
    payment.providerRef!,
    outcome,
    payment.amountMinor,
    payment.currency,
  );
  return handlePaymentWebhook(body, signature);
}

/** Testdepositum uden Stripe: som hvis kunden havde godkendt kortet på personalets skærm. */
export async function simulateDeposit(ctx: PolicyContext, bookingId: string) {
  if (!fakePaymentsAllowed() || paymentProvider().name !== "fake") {
    throw new AppError("FORBIDDEN", "Testbetaling er slået fra");
  }
  await startDeposit(ctx, bookingId);
  const payment = await db.payment.findFirstOrThrow({
    where: { bookingId, kind: "DEPOSIT_HOLD", provider: "fake", status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  const { body, signature } = fakeProvider.signedEvent(
    payment.providerRef!,
    payment.isAuthorization ? "authorized" : "succeeded",
    payment.amountMinor,
    payment.currency,
  );
  return handlePaymentWebhook(body, signature);
}
