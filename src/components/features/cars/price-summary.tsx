import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { formatMoney } from "@/lib/format";
import type { Quote } from "@/server/pricing/types";

const feeLabels = ["DELIVERY_FEE", "ONE_WAY_FEE", "DISCOUNT", "FEE"] as const;

function labelKey(type: string): (typeof feeLabels)[number] | "EXTRA" {
  return feeLabels.find((label) => label === type) ?? "EXTRA";
}

/**
 * Prislinjerne fra prismotoren. Regner intet selv. Med `extraNames` (kode → navn) vises
 * ekstraudstyrets navn i stedet for "Ekstraudstyr".
 */
export function PriceSummary({
  quote,
  extraNames,
}: {
  quote: Quote;
  extraNames?: Record<string, string>;
}) {
  const t = useTranslations("car");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-2 text-base">
        {quote.lines.map((line, index) => (
          <div key={`${line.type}-${line.code}-${index}`} className="flex justify-between gap-4">
            <dt className="text-ink-700">
              {line.type === "RENTAL"
                ? t("lines.RENTAL", { days: quote.rentalDays })
                : line.type === "EXTRA" && extraNames?.[line.code]
                  ? line.quantity > 1
                    ? `${extraNames[line.code]} × ${line.quantity}`
                    : extraNames[line.code]
                  : t(`lines.${labelKey(line.type)}`)}
            </dt>
            <dd className="font-medium text-ink-900">
              <Price amountMinor={line.totalMinor} currency={quote.currency} />
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border pt-3 text-lg font-semibold">
          <dt>{t("totalLabel")}</dt>
          <dd>
            <Price amountMinor={quote.totalMinor} currency={quote.currency} />
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted">
        {t("vatIncluded", {
          price: formatMoney(quote.vatMinor, quote.currency, locale),
        })}
      </p>
    </div>
  );
}
