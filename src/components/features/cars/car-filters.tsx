import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { sortOptions, type CarSearch } from "@/lib/validation/search";

/** Filtre og sortering som GET-formular. Søgningens periode bevares i skjulte felter. */
export function CarFilters({
  action,
  categories,
  values,
  period,
}: {
  action: string;
  categories: { slug: string; name: string }[];
  values: CarSearch;
  period: Record<string, string>;
}) {
  const t = useTranslations("cars");
  return (
    <form
      action={action}
      method="get"
      aria-label={t("filters")}
      className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-ink-50 p-4 sm:grid-cols-3 lg:grid-cols-6 lg:items-end"
    >
      {Object.entries(period).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label={t("category")}>
        {(props) => (
          <Select name="category" defaultValue={values.category ?? ""} {...props}>
            <option value="">{t("any")}</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("transmission")}>
        {(props) => (
          <Select name="transmission" defaultValue={values.transmission ?? ""} {...props}>
            <option value="">{t("any")}</option>
            <option value="AUTOMATIC">{t("transmissionNames.AUTOMATIC")}</option>
            <option value="MANUAL">{t("transmissionNames.MANUAL")}</option>
          </Select>
        )}
      </Field>
      <Field label={t("fuel")}>
        {(props) => (
          <Select name="fuel" defaultValue={values.fuel ?? ""} {...props}>
            <option value="">{t("any")}</option>
            {(["PETROL", "DIESEL", "HYBRID", "ELECTRIC"] as const).map((fuel) => (
              <option key={fuel} value={fuel}>
                {t(`fuelNames.${fuel}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("seats")}>
        {(props) => (
          <Select name="seats" defaultValue={values.seats ? String(values.seats) : ""} {...props}>
            <option value="">{t("any")}</option>
            {[4, 5, 7, 9].map((count) => (
              <option key={count} value={count}>
                {t("seatsMin", { count })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("sort")}>
        {(props) => (
          <Select name="sort" defaultValue={values.sort} {...props}>
            {sortOptions.map((option) => (
              <option key={option} value={option}>
                {t(`sortOptions.${option}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
        <Button type="submit">{t("apply")}</Button>
        <Link
          href={{ pathname: "/cars", query: period }}
          className="text-center text-sm text-brand-700 hover:underline"
        >
          {t("reset")}
        </Link>
      </div>
    </form>
  );
}
