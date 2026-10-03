"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PricingRuleFormState } from "@/app/admin/pricing/actions";

type Action = (state: PricingRuleFormState, formData: FormData) => Promise<PricingRuleFormState>;
type Values = NonNullable<PricingRuleFormState["values"]>;

/**
 * Et trin i pristrappen (F8, K3). Tom model = hele kategorien; tomme datoer = hele året. Ved flere
 * regler for samme antal dage vinder den højeste prioritet, fx en sæsonpris.
 */
export function PricingRuleForm({
  action,
  categoryId,
  models,
  defaults,
  ruleId,
}: {
  action: Action;
  categoryId: string;
  models: { id: string; name: string; isActive: boolean }[];
  defaults: Values;
  ruleId?: string;
}) {
  const t = useTranslations("admin.pricing.form");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const value = (name: keyof Values) => values[name] ?? "";
  const error = (name: keyof Values) =>
    state.fields?.includes(name) ? t(`errors.${name}`) : undefined;
  const input = (
    name: keyof Values,
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

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="categoryId" value={categoryId} />
      {ruleId ? <input type="hidden" name="ruleId" value={ruleId} /> : null}
      {state.error ? <Alert tone="danger">{t(`notices.${state.error}`)}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("carModelId")} hint={t("carModelIdHint")} error={error("carModelId")}>
          {(field) => (
            <Select name="carModelId" defaultValue={value("carModelId")} {...field}>
              <option value="">{t("wholeCategory")}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.isActive ? model.name : t("inactiveModel", { name: model.name })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {input("minDays", { required: true, numeric: "numeric", hint: t("minDaysHint") })}
        {input("packagePrice", { required: true, numeric: "decimal", hint: t("packagePriceHint") })}
        {input("perDayPrice", { required: true, numeric: "decimal", hint: t("perDayPriceHint") })}
        {input("validFrom", { type: "date", hint: t("seasonHint") })}
        {input("validTo", { type: "date" })}
        {input("priority", { numeric: "numeric", hint: t("priorityHint") })}
      </div>
      <Button type="submit" loading={pending} className="self-start">
        {ruleId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
