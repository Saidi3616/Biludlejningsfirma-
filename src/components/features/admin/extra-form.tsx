"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExtraFormState } from "@/app/admin/extras/actions";

type Action = (state: ExtraFormState, formData: FormData) => Promise<ExtraFormState>;
type Values = NonNullable<ExtraFormState["values"]>;

/** Ekstraudstyr (opret og ret): navn på alle sprog, pris pr. dag eller pr. booking, loft og lager. */
export function ExtraForm({
  action,
  defaults,
  extraId,
}: {
  action: Action;
  defaults: Values;
  extraId?: string;
}) {
  const t = useTranslations("admin.extras.form");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const value = (name: keyof Values) => values[name] ?? "";
  const error = (name: keyof Values) =>
    state.fields?.includes(name)
      ? state.error === "duplicate"
        ? t("duplicate")
        : t(`errors.${name}`)
      : undefined;
  const input = (
    name: keyof Values,
    props: { hint?: string; required?: boolean; numeric?: "numeric" | "decimal"; dir?: "rtl" } = {},
  ) => (
    <Field label={t(name)} hint={props.hint} required={props.required} error={error(name)}>
      {(field) => (
        <Input
          name={name}
          dir={props.dir}
          inputMode={props.numeric}
          defaultValue={value(name)}
          {...field}
        />
      )}
    </Field>
  );
  const description = (name: keyof Values, dir: "ltr" | "rtl") => (
    <Field label={t(name)} error={error(name)}>
      {(field) => <Textarea name={name} rows={2} dir={dir} defaultValue={value(name)} {...field} />}
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {extraId ? <input type="hidden" name="extraId" value={extraId} /> : null}
      {state.error ? <Alert tone="danger">{t(`notices.${state.error}`)}</Alert> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("names")}</legend>
        <p className="text-sm text-muted">{t("namesHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("nameDa", { required: true })}
          {input("nameEn")}
          {input("nameFr")}
          {input("nameAr", { dir: "rtl" })}
        </div>
        {input("code", { required: true, hint: t("codeHint") })}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("price")}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("pricing")} required error={error("pricing")}>
            {(field) => (
              <Select name="pricing" defaultValue={value("pricing")} {...field}>
                <option value="PER_DAY">{t("pricingOptions.PER_DAY")}</option>
                <option value="PER_BOOKING">{t("pricingOptions.PER_BOOKING")}</option>
              </Select>
            )}
          </Field>
          {input("price", { required: true, numeric: "decimal", hint: t("amountHint") })}
          {input("maxPrice", { numeric: "decimal", hint: t("maxPriceHint") })}
          {input("maxQuantity", { required: true, numeric: "numeric", hint: t("maxQuantityHint") })}
          {input("stock", { numeric: "numeric", hint: t("stockHint") })}
          {input("sortOrder", { numeric: "numeric", hint: t("sortOrderHint") })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("descriptions")}</legend>
        <p className="text-sm text-muted">{t("descriptionsHint")}</p>
        {description("descriptionDa", "ltr")}
        {description("descriptionEn", "ltr")}
        {description("descriptionFr", "ltr")}
        {description("descriptionAr", "rtl")}
      </fieldset>

      <Checkbox
        name="isActive"
        label={t("isActive")}
        description={t("isActiveHint")}
        defaultChecked={value("isActive") === "on"}
      />

      <Button type="submit" loading={pending} className="self-start">
        {extraId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
