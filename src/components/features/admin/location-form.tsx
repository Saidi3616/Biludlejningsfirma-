"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { LocationFormState } from "@/app/admin/locations/actions";

type Action = (state: LocationFormState, formData: FormData) => Promise<LocationFormState>;
type Values = NonNullable<LocationFormState["values"]>;

/** Lokationens stamdata (opret og ret): adresse, koordinater, kontakt, klargøring og gebyrer. */
export function LocationForm({
  action,
  defaults,
  locationId,
}: {
  action: Action;
  defaults: Values;
  locationId?: string;
}) {
  const t = useTranslations("admin.locations.form");
  const types = useTranslations("admin.locations.types");
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
    props: {
      hint?: string;
      required?: boolean;
      numeric?: "numeric" | "decimal";
      type?: "email" | "tel";
      ltr?: boolean;
    } = {},
  ) => (
    <Field label={t(name)} hint={props.hint} required={props.required} error={error(name)}>
      {(field) => (
        <Input
          name={name}
          type={props.type}
          dir={props.ltr ? "ltr" : undefined}
          inputMode={props.numeric}
          defaultValue={value(name)}
          {...field}
        />
      )}
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {locationId ? <input type="hidden" name="locationId" value={locationId} /> : null}
      {state.error ? <Alert tone="danger">{t(`notices.${state.error}`)}</Alert> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("details")}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {input("name", { required: true })}
          {input("slug", { required: true, hint: t("slugHint"), ltr: true })}
          <Field label={t("type")} required error={error("type")}>
            {(field) => (
              <Select name="type" defaultValue={value("type")} {...field}>
                <option value="OFFICE">{types("OFFICE")}</option>
                <option value="AIRPORT">{types("AIRPORT")}</option>
                <option value="PARTNER">{types("PARTNER")}</option>
              </Select>
            )}
          </Field>
          {input("address", { required: true })}
          {input("postalCode", { required: true })}
          {input("city", { required: true })}
          {input("country", { required: true, hint: t("countryHint"), ltr: true })}
          {input("lat", { required: true, numeric: "decimal", hint: t("coordsHint"), ltr: true })}
          {input("lng", { required: true, numeric: "decimal", ltr: true })}
          {input("timezone", { required: true, hint: t("timezoneHint"), ltr: true })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("contact")}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {input("phone", { type: "tel", ltr: true })}
          {input("whatsapp", { type: "tel", ltr: true })}
          {input("email", { type: "email", ltr: true })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("operations")}</legend>
        <p className="text-sm text-muted">{t("bufferHint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {input("bufferBeforeMinutes", { required: true, numeric: "numeric" })}
          {input("bufferAfterMinutes", { required: true, numeric: "numeric" })}
          {input("oneWayFee", { numeric: "decimal", hint: t("oneWayFeeHint") })}
        </div>
        <Checkbox
          name="deliveryEnabled"
          label={t("deliveryEnabled")}
          description={t("deliveryEnabledHint")}
          defaultChecked={value("deliveryEnabled") === "on"}
        />
        <Checkbox
          name="isActive"
          label={t("isActive")}
          description={t("isActiveHint")}
          defaultChecked={value("isActive") === "on"}
        />
      </fieldset>

      <Button type="submit" loading={pending} className="self-start">
        {locationId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
