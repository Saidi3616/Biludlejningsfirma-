"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Fuel, Transmission } from "@/generated/prisma/enums";
import type { ModelFormState } from "@/app/admin/fleet/models/actions";

type Action = (state: ModelFormState, formData: FormData) => Promise<ModelFormState>;
type Values = NonNullable<ModelFormState["values"]>;

/** Katalogmodel (opret og ret): specifikationer, km-regler, depositum og beskrivelser. */
export function ModelForm({
  action,
  categories,
  defaults,
  modelId,
}: {
  action: Action;
  categories: { id: string; name: string }[];
  defaults: Values;
  modelId?: string;
}) {
  const t = useTranslations("admin.fleet.modelForm");
  const tTransmission = useTranslations("cars.transmissionNames");
  const tFuel = useTranslations("cars.fuelNames");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const value = (name: keyof Values) => values[name] ?? "";
  const error = (name: keyof Values) =>
    state.fields?.includes(name)
      ? state.error === "duplicate"
        ? t("duplicate")
        : t("invalid")
      : undefined;
  const input = (
    name: keyof Values,
    props: { hint?: string; required?: boolean; numeric?: "numeric" | "decimal" } = {},
  ) => (
    <Field label={t(name)} hint={props.hint} required={props.required} error={error(name)}>
      {(field) => (
        <Input name={name} inputMode={props.numeric} defaultValue={value(name)} {...field} />
      )}
    </Field>
  );
  const description = (name: keyof Values, dir: "ltr" | "rtl", required = false) => (
    <Field label={t(name)} required={required} error={error(name)}>
      {(field) => <Textarea name={name} rows={3} dir={dir} defaultValue={value(name)} {...field} />}
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {modelId ? <input type="hidden" name="modelId" value={modelId} /> : null}
      {state.error ? <Alert tone="danger">{t(`errors.${state.error}`)}</Alert> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("basics")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("brand", { required: true })}
          {input("model", { required: true })}
          {input("year", { required: true, numeric: "numeric" })}
          <Field label={t("categoryId")} required error={error("categoryId")}>
            {(field) => (
              <Select name="categoryId" defaultValue={value("categoryId")} {...field}>
                <option value="">{t("choose")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {input("slug", { required: true, hint: t("slugHint") })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("specs")}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("transmission")} required error={error("transmission")}>
            {(field) => (
              <Select name="transmission" defaultValue={value("transmission")} {...field}>
                {Object.values(Transmission).map((option) => (
                  <option key={option} value={option}>
                    {tTransmission(option)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("fuel")} required error={error("fuel")}>
            {(field) => (
              <Select name="fuel" defaultValue={value("fuel")} {...field}>
                {Object.values(Fuel).map((option) => (
                  <option key={option} value={option}>
                    {tFuel(option)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {input("seats", { required: true, numeric: "numeric" })}
          {input("doors", { required: true, numeric: "numeric" })}
          {input("bags", { required: true, numeric: "numeric" })}
        </div>
        <Checkbox
          name="airConditioning"
          label={t("airConditioning")}
          defaultChecked={value("airConditioning") === "on"}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("terms")}</legend>
        <p className="text-sm text-muted">{t("termsHint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {input("includedKmPerDay", { required: true, numeric: "numeric" })}
          {input("extraKmFee", { required: true, numeric: "decimal", hint: t("amountHint") })}
          {input("deposit", { required: true, numeric: "decimal", hint: t("amountHint") })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("descriptions")}</legend>
        <p className="text-sm text-muted">{t("descriptionsHint")}</p>
        {description("descriptionDa", "ltr", true)}
        {description("descriptionEn", "ltr")}
        {description("descriptionFr", "ltr")}
        {description("descriptionAr", "rtl")}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("visibility")}</legend>
        <Checkbox
          name="isActive"
          label={t("isActive")}
          description={t("isActiveHint")}
          defaultChecked={value("isActive") === "on"}
        />
        <Checkbox
          name="isFeatured"
          label={t("isFeatured")}
          description={t("isFeaturedHint")}
          defaultChecked={value("isFeatured") === "on"}
        />
      </fieldset>

      <Button type="submit" loading={pending} className="self-start">
        {modelId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
