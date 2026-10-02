import { useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { formatDate } from "@/lib/format";
import type { PaymentKind, PaymentMethod, PaymentRecordStatus } from "@/generated/prisma/enums";

export type PaymentRow = {
  id: string;
  kind: PaymentKind;
  status: PaymentRecordStatus;
  method: PaymentMethod | null;
  cardBrand: string | null;
  cardLast4: string | null;
  amountMinor: number;
  currency: string;
  createdAt: Date;
};

const TIME_ZONE = "Europe/Copenhagen";

/** Betalinger og refusioner med metode. Kortdata vises kun som brand og sidste 4 cifre. */
export function PaymentList({
  payments,
  locale,
  children,
}: {
  payments: PaymentRow[];
  locale: string;
  /** Fx et link til bookingen pr. række. */
  children?: (payment: PaymentRow) => React.ReactNode;
}) {
  const t = useTranslations("account.payments");
  const method = (payment: PaymentRow) => {
    if (payment.cardLast4) {
      return t("card", { brand: payment.cardBrand ?? "", last4: payment.cardLast4 });
    }
    return payment.method ? t(`methods.${payment.method}`) : null;
  };

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {payments.map((payment) => {
        const refund = payment.kind === "REFUND";
        return (
          <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-ink-900">
                {refund
                  ? t(payment.status === "PENDING" ? "refundPending" : "refund")
                  : t("charge")}
              </span>
              <span className="text-sm text-muted">
                {formatDate(payment.createdAt, locale, TIME_ZONE)}
                {method(payment) ? ` · ${method(payment)}` : ""}
              </span>
              {children?.(payment)}
            </div>
            <span className="font-semibold text-ink-900">
              {refund ? "− " : ""}
              <Price amountMinor={payment.amountMinor} currency={payment.currency} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
