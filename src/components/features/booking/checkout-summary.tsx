import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, MapPin } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { PriceSummary } from "@/components/features/cars/price-summary";
import { formatMoney } from "@/lib/format";
import type { Quote } from "@/server/pricing/types";

export type SummaryTrip = {
  carName: string;
  pickupName: string;
  returnName: string;
  /** Allerede formateret i lokationens tidszone. */
  pickupAt: string;
  returnAt: string;
};

function Trip({ trip }: { trip: SummaryTrip }) {
  const t = useTranslations("booking");
  return (
    <dl className="flex flex-col gap-3 text-base">
      <div className="flex gap-3">
        <dt className="sr-only">{t("pickup")}</dt>
        <MapPin className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
        <dd>
          <span className="font-medium text-ink-900">{t("pickup")}:</span> {trip.pickupName},{" "}
          {trip.pickupAt}
        </dd>
      </div>
      <div className="flex gap-3">
        <dt className="sr-only">{t("return")}</dt>
        <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
        <dd>
          <span className="font-medium text-ink-900">{t("return")}:</span> {trip.returnName},{" "}
          {trip.returnAt}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Prisoversigten, der følger kunden gennem flowet: sidebar på desktop, sammenfoldelig boks
 * øverst på mobil (05-user-flows.md).
 */
export function CheckoutSummary({
  trip,
  quote,
  extraNames,
}: {
  trip: SummaryTrip;
  quote: Quote;
  extraNames: Record<string, string>;
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const body = (
    <div className="flex flex-col gap-5">
      <Trip trip={trip} />
      <PriceSummary quote={quote} extraNames={extraNames} />
      {quote.deposit.amountMinor > 0 ? (
        <p className="rounded-md bg-surface p-3 text-sm text-ink-700">
          {t("depositNote", {
            price: formatMoney(quote.deposit.amountMinor, quote.currency, locale),
          })}
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      <details className="rounded-xl border border-border bg-white lg:hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 text-base font-semibold text-ink-900">
          <span>{trip.carName}</span>
          <span className="flex items-center gap-2">
            <span className="sr-only">{t("totalLabel")}</span>
            <Price amountMinor={quote.totalMinor} currency={quote.currency} />
          </span>
        </summary>
        <div className="border-t border-border p-4">{body}</div>
      </details>
      <Card className="hidden self-start lg:sticky lg:top-24 lg:block">
        <CardHeader>
          <CardTitle>{t("summaryTitle")}</CardTitle>
          <p className="text-lg font-semibold text-ink-900">{trip.carName}</p>
        </CardHeader>
        <CardBody>{body}</CardBody>
      </Card>
    </>
  );
}
