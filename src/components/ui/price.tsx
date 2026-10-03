import { useLocale } from "next-intl";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Viser et beløb, der allerede er beregnet på serveren. Regner aldrig selv. */
export function Price({
  amountMinor,
  currency,
  className,
}: {
  amountMinor: number;
  currency: string;
  className?: string;
}) {
  const locale = useLocale();
  return (
    <span className={cn("tabular-nums", className)}>
      {formatMoney(amountMinor, currency, locale)}
    </span>
  );
}
