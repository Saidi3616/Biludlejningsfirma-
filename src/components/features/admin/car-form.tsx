"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CarFormState } from "@/app/admin/fleet/cars/actions";

type Action = (state: CarFormState, formData: FormData) => Promise<CarFormState>;
type Values = NonNullable<CarFormState["values"]>;

/** Stamdata for en bil (opret og ret). Felterne beholder deres værdier, hvis noget fejler. */
export function CarForm({
  action,
  options,
  defaults,
  carId,
  showPurchasePrice,
}: {
  action: Action;
  options: { models: { id: string; name: string }[]; locations: { id: string; name: string }[] };
  defaults: Values;
  carId?: string;
  showPurchasePrice: boolean;
}) {
  const t = useTranslations("admin.fleet.form");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const value = (name: keyof Values) => values[name] ?? "";
  const error = (name: keyof Values) => {
    if (!state.fields?.includes(name)) return undefined;
    if (state.error === "duplicate") return t("duplicate");
    if (state.error === "odometerDown") return t("odometerDown");
    return t("invalid");
  };
  const text = (name: keyof Values, props: { hint?: string; required?: boolean } = {}) => (
    <Field label={t(name)} hint={props.hint} required={props.required} error={error(name)}>
      {(field) => <Input name={name} defaultValue={value(name)} {...field} />}
    </Field>
  );
  const date = (name: keyof Values) => (
    <Field label={t(name)} error={error(name)}>
      {(field) => <Input type="date" name={name} defaultValue={value(name)} {...field} />}
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {carId ? <input type="hidden" name="carId" value={carId} /> : null}
      {state.error === "hasBookings" ? (
        <Alert tone="danger" title={t("errors.hasBookings")}>
          <ul className="flex flex-wrap gap-2">
            {state.references?.map((reference) => (
              <li key={reference}>
                <Link href={`/admin/bookings/${reference}`} className="text-brand-700 underline">
                  {reference}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      ) : state.error ? (
        <Alert tone="danger">{t(`errors.${state.error}`)}</Alert>
      ) : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("identity")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("carModelId")} required error={error("carModelId")}>
            {(field) => (
              <Select name="carModelId" defaultValue={value("carModelId")} {...field}>
                <option value="">{t("choose")}</option>
                {options.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("homeLocationId")} required error={error("homeLocationId")}>
            {(field) => (
              <Select
                name="homeLocationId"
                defaultValue={value("homeLocationId") || options.locations[0]?.id}
                {...field}
              >
                {options.locations.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {text("registrationNumber", { required: true, hint: t("registrationHint") })}
          {text("vin", { required: true, hint: t("vinHint") })}
          {text("color")}
          <Field label={t("odometerKm")} required error={error("odometerKm")}>
            {(field) => (
              <Input
                name="odometerKm"
                inputMode="numeric"
                defaultValue={value("odometerKm")}
                {...field}
              />
            )}
          </Field>
          {text("tyreType", { hint: t("tyreHint") })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("deadlines")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {date("nextInspectionDue")}
          {date("nextServiceDue")}
          <Field label={t("nextServiceKm")} error={error("nextServiceKm")}>
            {(field) => (
              <Input
                name="nextServiceKm"
                inputMode="numeric"
                defaultValue={value("nextServiceKm")}
                {...field}
              />
            )}
          </Field>
          {text("insurancePolicy")}
          {date("insuranceExpiresAt")}
        </div>
      </fieldset>

      {showPurchasePrice ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-semibold text-ink-900">{t("purchase")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {date("purchaseDate")}
            <Field label={t("purchasePrice")} hint={t("amountHint")} error={error("purchasePrice")}>
              {(field) => (
                <Input
                  name="purchasePrice"
                  inputMode="decimal"
                  defaultValue={value("purchasePrice")}
                  {...field}
                />
              )}
            </Field>
          </div>
        </fieldset>
      ) : null}

      <Button type="submit" loading={pending} className="self-start">
        {carId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
