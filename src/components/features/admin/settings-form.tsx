"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SettingsFormState } from "@/app/admin/settings/actions";

type Action = (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
type Values = NonNullable<SettingsFormState["values"]>;

/** Firmaets kontaktoplysninger (SUPER_ADMIN). */
export function SettingsForm({ action, defaults }: { action: Action; defaults: Values }) {
  const t = useTranslations("admin.settings");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const input = (
    name: keyof Values,
    props: { hint?: string; required?: boolean; type?: "email" | "tel" } = {},
  ) => (
    <Field
      label={t(name)}
      hint={props.hint}
      required={props.required}
      error={state.fields?.includes(name) ? t(`errors.${name}`) : undefined}
    >
      {(field) => (
        <Input
          name={name}
          type={props.type}
          dir={props.type ? "ltr" : undefined}
          defaultValue={values[name] ?? ""}
          {...field}
        />
      )}
    </Field>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.error ? <Alert tone="danger">{t(`notices.${state.error}`)}</Alert> : null}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("contact")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("phone", { required: true, type: "tel", hint: t("phoneHint") })}
          {input("whatsappNumber", { required: true, type: "tel", hint: t("whatsappHint") })}
          {input("email", { required: true, type: "email" })}
          {input("address", { hint: t("addressHint") })}
        </div>
      </fieldset>
      <Button type="submit" loading={pending} className="self-start">
        {t("save")}
      </Button>
    </form>
  );
}
