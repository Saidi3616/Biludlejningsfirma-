import type { PaymentKind, PaymentRecordStatus } from "@/generated/prisma/enums";

type PaymentRow = { kind: PaymentKind; status: PaymentRecordStatus; amountMinor: number };

/** Penge, kunden har betalt: kort/MobilePay online (CHARGE) eller ved skranken (MANUAL). */
export function isReceived(payment: Pick<PaymentRow, "kind" | "status">): boolean {
  return (payment.kind === "CHARGE" || payment.kind === "MANUAL") && payment.status === "SUCCEEDED";
}

/** Refusioner, der er gennemført eller sat i gang. */
export function isRefund(payment: Pick<PaymentRow, "kind" | "status">): boolean {
  return (
    payment.kind === "REFUND" && (payment.status === "PENDING" || payment.status === "SUCCEEDED")
  );
}

export function receivedMinor(payments: PaymentRow[]): number {
  return payments.filter(isReceived).reduce((sum, payment) => sum + payment.amountMinor, 0);
}

export function refundedMinor(payments: PaymentRow[]): number {
  return payments.filter(isRefund).reduce((sum, payment) => sum + payment.amountMinor, 0);
}

/** Betalt minus refunderet (også refusioner, der er sat i gang). */
export function netPaidMinor(payments: PaymentRow[]): number {
  return receivedMinor(payments) - refundedMinor(payments);
}
