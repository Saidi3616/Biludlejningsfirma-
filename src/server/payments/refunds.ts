import "server-only";
import type { PaymentStatus, Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isReceived, isRefund, netPaidMinor, receivedMinor } from "@/lib/payments";
import { db } from "@/server/db";
import { paymentProvider } from "./provider";

type Client = Prisma.TransactionClient | typeof db;

/** En refusion, der skal gennemføres hos betalingsudbyderen, når transaktionen er committet. */
export type PlannedRefund = { id: string; chargeRef: string; amountMinor: number };

/**
 * Registrerer en refusion på `amountMinor`, fordelt på bookingens betalinger: online betalinger
 * først (refunderes hos udbyderen og står som PENDING, til udbyderen har svaret), derefter
 * skrankebetalinger (betales tilbage ved skranken; gennemført, når en medarbejder står for det).
 * Kaldes i en transaktion; `processRefunds` gennemfører bagefter de planlagte refusioner.
 */
export async function planRefunds(
  tx: Prisma.TransactionClient,
  bookingId: string,
  amountMinor: number,
  options: { actorUserId?: string | null } = {},
): Promise<PlannedRefund[]> {
  if (amountMinor <= 0) return [];
  const payments = await tx.payment.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      parentPaymentId: true,
      kind: true,
      status: true,
      method: true,
      amountMinor: true,
      currency: true,
      provider: true,
      providerRef: true,
    },
  });
  if (amountMinor > netPaidMinor(payments)) {
    throw new AppError("CONFLICT", "Refusionen er større end det betalte beløb");
  }

  const refundedOf = (paymentId: string) =>
    payments
      .filter((payment) => isRefund(payment) && payment.parentPaymentId === paymentId)
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
  // Online betalinger refunderes hos udbyderen: en kortbetaling, eller en del af et depositum,
  // der er trukket på kort (refunderes via depositummets betaling).
  const chargeRef = (payment: (typeof payments)[number]) => {
    if (payment.kind === "CHARGE") return payment.providerRef;
    if (payment.kind !== "DEPOSIT_CAPTURE") return null;
    return payments.find((hold) => hold.id === payment.parentPaymentId)?.providerRef ?? null;
  };
  const online = (payment: (typeof payments)[number]) => Boolean(chargeRef(payment));
  const sources = payments.filter(isReceived).sort((a, b) => Number(online(b)) - Number(online(a)));

  let remaining = amountMinor;
  const planned: PlannedRefund[] = [];
  for (const source of sources) {
    const amount = Math.min(source.amountMinor - refundedOf(source.id), remaining);
    if (amount <= 0) continue;
    const viaProvider = online(source);
    const refund = await tx.payment.create({
      data: {
        bookingId,
        parentPaymentId: source.id,
        kind: "REFUND",
        // Kontant: gennemført, når en medarbejder refunderer; ved kundens egen annullering venter
        // den, til personalet har betalt pengene tilbage.
        status: viaProvider || !options.actorUserId ? "PENDING" : "SUCCEEDED",
        method: source.method,
        amountMinor: amount,
        currency: source.currency,
        provider: viaProvider ? source.provider : "manual",
        recordedByUserId: viaProvider ? null : (options.actorUserId ?? null),
      },
      select: { id: true },
    });
    if (viaProvider)
      planned.push({ id: refund.id, chargeRef: chargeRef(source)!, amountMinor: amount });
    remaining -= amount;
    if (remaining === 0) break;
  }
  if (remaining > 0) {
    throw new AppError("CONFLICT", "Refusionen kan ikke fordeles på bookingens betalinger");
  }
  return planned;
}

/**
 * Gennemfører refusionerne hos udbyderen. Fejler en, logges det, og den står som PENDING, så
 * personalet kan prøve igen fra admin. Returnerer antallet, der fejlede.
 */
export async function processRefunds(bookingId: string, planned: PlannedRefund[]) {
  let failed = 0;
  for (const refund of planned) {
    try {
      const result = await paymentProvider().refund(
        refund.chargeRef,
        refund.amountMinor,
        `refund:${refund.id}`,
      );
      await db.payment.update({
        where: { id: refund.id },
        data: { status: "SUCCEEDED", providerRef: result.providerRef },
      });
    } catch (error) {
      failed++;
      logger.error(
        { bookingId, paymentId: refund.id, err: error },
        "refund failed; retry from admin",
      );
    }
  }
  await refreshPaymentStatus(db, bookingId);
  return failed;
}

/** Bookingens betalingsstatus ud fra betalinger og gennemførte refusioner. */
export async function refreshPaymentStatus(client: Client, bookingId: string) {
  const booking = await client.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      paymentStatus: true,
      payments: { select: { kind: true, status: true, amountMinor: true } },
    },
  });
  const received = receivedMinor(booking.payments);
  const refunded = booking.payments
    .filter((payment) => payment.kind === "REFUND" && payment.status === "SUCCEEDED")
    .reduce((sum, payment) => sum + payment.amountMinor, 0);
  let status: PaymentStatus = booking.paymentStatus;
  if (received > 0) {
    if (refunded === 0) status = "PAID";
    else status = refunded >= received ? "REFUNDED" : "PARTIALLY_REFUNDED";
  }
  if (status !== booking.paymentStatus) {
    await client.booking.update({ where: { id: bookingId }, data: { paymentStatus: status } });
  }
  return status;
}
