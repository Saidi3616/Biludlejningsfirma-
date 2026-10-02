import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { CarSearch } from "@/lib/validation/search";

/** Halvtimer fra 06:00 til 23:00. Åbningstiderne tjekkes på serveren. */
const times = Array.from({ length: 35 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export type SearchLocation = { slug: string; name: string };

/**
 * Søgning på sted og periode. En almindelig GET-formular: virker uden JavaScript, og
 * resultatet har en URL, der kan deles. Bruges på forsiden, i kataloget og på bil-siden.
 */
export function SearchForm({
  action,
  locations,
  values,
  minDate,
  hidden = {},
  submitLabel,
  layout = "stacked",
  className,
}: {
  /** Den sprogpræfiksede sti, formularen sendes til. */
  action: string;
  locations: SearchLocation[];
  values: Partial<CarSearch>;
  /** I dag på virksomhedens ur ("YYYY-MM-DD"). */
  minDate: string;
  /** Andre værdier, der skal bevares, fx filtre i kataloget. */
  hidden?: Record<string, string>;
  submitLabel: string;
  layout?: "stacked" | "wide";
  className?: string;
}) {
  const t = useTranslations("search");
  const wide = layout === "wide";

  return (
    <form
      action={action}
      method="get"
      className={cn("grid gap-4", wide && "sm:grid-cols-2 lg:grid-cols-12", className)}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label={t("pickupLocation")} required className={wide ? "lg:col-span-3" : undefined}>
        {(props) => (
          <Select name="location" defaultValue={values.location ?? ""} {...props}>
            <option value="" disabled>
              {t("chooseLocation")}
            </option>
            {locations.map((location) => (
              <option key={location.slug} value={location.slug}>
                {location.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("returnLocation")} className={wide ? "lg:col-span-3" : undefined}>
        {(props) => (
          <Select name="returnLocation" defaultValue={values.returnLocation ?? ""} {...props}>
            <option value="">{t("sameAsPickup")}</option>
            {locations.map((location) => (
              <option key={location.slug} value={location.slug}>
                {location.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className={cn("grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3", wide && "lg:col-span-3")}>
        <Field label={t("pickupDate")} required>
          {(props) => (
            <Input
              type="date"
              name="pickupDate"
              min={minDate}
              defaultValue={values.pickupDate}
              {...props}
            />
          )}
        </Field>
        <Field label={t("pickupTime")}>
          {(props) => (
            <Select name="pickupTime" defaultValue={values.pickupTime ?? "10:00"} {...props}>
              {times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className={cn("grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3", wide && "lg:col-span-3")}>
        <Field label={t("returnDate")} required>
          {(props) => (
            <Input
              type="date"
              name="returnDate"
              min={minDate}
              defaultValue={values.returnDate}
              {...props}
            />
          )}
        </Field>
        <Field label={t("returnTime")}>
          {(props) => (
            <Select name="returnTime" defaultValue={values.returnTime ?? "10:00"} {...props}>
              {times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Button
        type="submit"
        variant="cta"
        size="lg"
        fullWidth
        className={wide ? "sm:col-span-2 lg:col-span-12" : undefined}
      >
        <Search aria-hidden />
        {submitLabel}
      </Button>
    </form>
  );
}
