"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { DiscountFormState, DiscountFormValues } from "@/app/admin/discounts/actions";

type Action = (state: DiscountFormState, formData: FormData) => Promise<DiscountFormState>;
type TextField = Exclude<keyof DiscountFormValues, "categoryIds" | "carModelIds">;

export type DiscountCarOptions = {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}[];

/** Rabatkode (opret og ret): procent eller fast beløb, periode, betingelser og hvilke biler. */
export function DiscountForm({
  action,
  defaults,
  options,
  discountId,
  codeLocked = false,
}: {
  action: Action;
  defaults: DiscountFormValues;
  options: DiscountCarOptions;
  discountId?: string;
  codeLocked?: boolean;
}) {
  const t = useTranslations("admin.discounts.form");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const value = (name: TextField) => values[name] ?? "";
  const error = (name: keyof DiscountFormValues) => {
    if (!state.fields?.includes(name)) return undefined;
    if (state.error === "duplicate") return t("duplicate");
    if (state.error === "inUse") return t("codeLocked");
    return t(`errors.${name}`);
  };
  const input = (
    name: TextField,
    props: {
      hint?: string;
      required?: boolean;
      numeric?: "numeric" | "decimal";
      type?: "date";
    } = {},
  ) => (
    <Field label={t(name)} hint={props.hint} required={props.required} error={error(name)}>
      {(field) => (
        <Input
          name={name}
          type={props.type}
          inputMode={props.numeric}
          defaultValue={value(name)}
          {...field}
        />
      )}
    </Field>
  );
  const categoryIds = new Set(values.categoryIds ?? []);
  const carModelIds = new Set(values.carModelIds ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {discountId ? <input type="hidden" name="discountId" value={discountId} /> : null}
      {state.error ? <Alert tone="danger">{t(`notices.${state.error}`)}</Alert> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("basics")}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={t("code")}
            hint={codeLocked ? t("codeLocked") : t("codeHint")}
            required
            error={error("code")}
          >
            {(field) => (
              <Input
                name="code"
                autoCapitalize="characters"
                readOnly={codeLocked}
                defaultValue={value("code")}
                {...field}
              />
            )}
          </Field>
          <Field label={t("type")} required error={error("type")}>
            {(field) => (
              <Select name="type" defaultValue={value("type")} {...field}>
                <option value="PERCENT">{t("typeOptions.PERCENT")}</option>
                <option value="FIXED">{t("typeOptions.FIXED")}</option>
              </Select>
            )}
          </Field>
          {input("value", { required: true, numeric: "decimal", hint: t("valueHint") })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("period")}</legend>
        <p className="text-sm text-muted">{t("periodHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("validFrom", { type: "date" })}
          {input("validTo", { type: "date" })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("limits")}</legend>
        <p className="text-sm text-muted">{t("limitHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {input("minBooking", { numeric: "decimal", hint: t("minBookingHint") })}
          {input("minDays", { numeric: "numeric" })}
          {input("maxUses", { numeric: "numeric" })}
          {input("maxUsesPerCustomer", { numeric: "numeric" })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("cars")}</legend>
        <p className="text-sm text-muted">{t("carsHint")}</p>
        {error("categoryIds") ? (
          <p className="text-sm text-danger-700">{error("categoryIds")}</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {options.map((category) => (
            <div key={category.id} className="flex flex-col gap-2">
              <Checkbox
                name="categoryIds"
                value={category.id}
                label={category.name}
                description={t("category")}
                defaultChecked={categoryIds.has(category.id)}
              />
              <div className="flex flex-col gap-2 ps-8">
                {category.models.map((model) => (
                  <Checkbox
                    key={model.id}
                    name="carModelIds"
                    value={model.id}
                    label={model.name}
                    defaultChecked={carModelIds.has(model.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <Checkbox
        name="isActive"
        label={t("isActive")}
        description={t("isActiveHint")}
        defaultChecked={value("isActive") === "on"}
      />

      <Button type="submit" loading={pending} className="self-start">
        {discountId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
