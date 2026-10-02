import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio, RadioGroup } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { extraFieldName } from "@/lib/validation/checkout";
import type { CheckoutExtra } from "@/server/booking/checkout";

function HiddenFields({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

/**
 * Trin 1: ekstraudstyr, afhentning/levering og rabatkode. En almindelig GET-formular, så valgene
 * står i URL'en og virker uden JavaScript. "Opdatér pris" bliver på trinnet; "Fortsæt" går videre.
 */
export function ExtrasForm({
  action,
  hidden,
  extras,
  pickup,
  deliveryZones,
  zone,
  discount,
  discountError,
  discountApplied,
}: {
  action: string;
  hidden: Record<string, string>;
  extras: CheckoutExtra[];
  pickup: { name: string; address: string; city: string };
  deliveryZones: { maxDistanceKm: number; feeMinor: number; currency: string }[];
  zone: number | undefined;
  discount: string | undefined;
  discountError: boolean;
  discountApplied: boolean;
}) {
  const t = useTranslations("booking");
  const locale = useLocale();
  const money = (amount: number, currency: string) => formatMoney(amount, currency, locale);

  return (
    <form action={action} method="get" className="flex flex-col gap-8">
      <HiddenFields values={hidden} />

      <section aria-labelledby="extras-title" className="flex flex-col gap-4">
        <h2 id="extras-title" className="text-xl font-semibold text-ink-900">
          {t("extras.title")}
        </h2>
        {extras.length === 0 ? (
          <p className="text-base text-muted">{t("extras.none")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {extras.map((extra) => {
              const price =
                extra.pricing === "PER_DAY"
                  ? t("extras.perDay", { price: money(extra.priceMinor, extra.currency) })
                  : t("extras.perBooking", { price: money(extra.priceMinor, extra.currency) });
              const description = [
                price,
                extra.maxPriceMinor !== null
                  ? t("extras.max", { price: money(extra.maxPriceMinor, extra.currency) })
                  : null,
                extra.description || null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={extra.code} className="p-4">
                  {extra.maxQuantity <= 1 ? (
                    <Checkbox
                      name={extraFieldName(extra.code)}
                      value="1"
                      defaultChecked={extra.quantity > 0}
                      label={extra.name}
                      description={description}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col">
                        <label htmlFor={`extra-${extra.code}`} className="text-base text-ink-900">
                          {extra.name}
                        </label>
                        <span className="text-sm text-muted">{description}</span>
                      </div>
                      <Select
                        id={`extra-${extra.code}`}
                        name={extraFieldName(extra.code)}
                        defaultValue={String(extra.quantity)}
                        className="w-20 shrink-0"
                        aria-label={`${extra.name}: ${t("extras.quantity")}`}
                      >
                        {Array.from({ length: extra.maxQuantity + 1 }, (_, index) => (
                          <option key={index} value={index}>
                            {index}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RadioGroup legend={<span className="text-xl font-semibold">{t("fulfilment.title")}</span>}>
        <Radio
          name="zone"
          value=""
          defaultChecked={!zone}
          label={t("fulfilment.pickup", { location: pickup.name })}
          description={`${pickup.address}, ${pickup.city}`}
        />
        {deliveryZones.map((candidate) => (
          <Radio
            key={candidate.maxDistanceKm}
            name="zone"
            value={candidate.maxDistanceKm}
            defaultChecked={zone === candidate.maxDistanceKm}
            label={t("fulfilment.delivery", { km: candidate.maxDistanceKm })}
            description={t("fulfilment.deliveryFee", {
              price: money(candidate.feeMinor, candidate.currency),
            })}
          />
        ))}
      </RadioGroup>

      <section className="flex flex-col gap-3">
        <Field
          label={t("discount.label")}
          hint={t("discount.hint")}
          error={discountError ? t("discount.invalid") : undefined}
          className="max-w-sm"
        >
          {(props) => (
            <Input
              name="discount"
              defaultValue={discount ?? ""}
              autoComplete="off"
              autoCapitalize="characters"
              {...props}
            />
          )}
        </Field>
        {discountApplied ? (
          <Alert tone="success">{t("discount.applied", { code: discount ?? "" })}</Alert>
        ) : null}
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button type="submit" name="step" value="extras" variant="secondary">
          <RefreshCw aria-hidden />
          {t("updatePrice")}
        </Button>
        <Button type="submit" name="step" value="details" variant="cta" size="lg">
          {t("continue")}
          <ArrowRight className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
