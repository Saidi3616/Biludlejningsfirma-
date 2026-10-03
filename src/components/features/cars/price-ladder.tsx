import { useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

type Tier = { minDays: number; packageMinor: number; perDayMinor: number };

/** Pristrappen: pakkepris og dagspris for 1, 3, 7 … dage. */
export function PriceLadder({
  tiers,
  currency,
  label,
}: {
  tiers: Tier[];
  currency: string;
  label: string;
}) {
  const t = useTranslations("car");
  return (
    <Table label={label}>
      <THead>
        <TR>
          <TH>{t("rentalPeriod")}</TH>
          <TH className="text-end">{t("package")}</TH>
          <TH className="text-end">{t("perDay")}</TH>
        </TR>
      </THead>
      <tbody>
        {tiers.map((tier) => (
          <TR key={tier.minDays}>
            <TD>{t("days", { count: tier.minDays })}</TD>
            <TD className="text-end font-medium">
              <Price amountMinor={tier.packageMinor} currency={currency} />
            </TD>
            <TD className="text-end text-ink-700">
              <Price amountMinor={tier.perDayMinor} currency={currency} />
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
