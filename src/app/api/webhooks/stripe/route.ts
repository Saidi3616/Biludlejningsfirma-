import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { handlePaymentWebhook } from "@/server/payments/service";

/**
 * Stripe-webhooks (07-api.md). Ingen session: signaturen verificeres med STRIPE_WEBHOOK_SECRET.
 * 200 = behandlet (eller allerede behandlet); 400 = ugyldig signatur; 500 = Stripe prøver igen.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await handlePaymentWebhook(rawBody, request.headers.get("stripe-signature"));
    return Response.json({ received: true, result });
  } catch (error) {
    if (error instanceof AppError && error.code === "WEBHOOK_INVALID") {
      return Response.json({ error: { code: error.code } }, { status: 400 });
    }
    logger.error({ err: error }, "payment webhook failed");
    return Response.json({ error: { code: "INTERNAL" } }, { status: 500 });
  }
}
