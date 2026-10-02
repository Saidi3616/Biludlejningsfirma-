"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { staffRoles } from "@/lib/validation/users";
import type { InviteFormState } from "@/app/admin/users/actions";

type Action = (state: InviteFormState, formData: FormData) => Promise<InviteFormState>;

/** Invitér en medarbejder: navn, e-mail og rolle. Medarbejderen vælger selv password. */
export function InviteForm({ action }: { action: Action }) {
  const t = useTranslations("admin.users");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? { role: "STAFF" };
  const error = (name: "name" | "email" | "role") =>
    state.fields?.includes(name)
      ? state.error === "duplicate"
        ? t("form.duplicate")
        : t(`form.errors.${name}`)
      : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{t(`form.notices.${state.error}`)}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("form.name")} required error={error("name")}>
          {(field) => (
            <Input name="name" autoComplete="off" defaultValue={values.name ?? ""} {...field} />
          )}
        </Field>
        <Field label={t("form.email")} required error={error("email")}>
          {(field) => (
            <Input
              name="email"
              type="email"
              dir="ltr"
              autoComplete="off"
              defaultValue={values.email ?? ""}
              {...field}
            />
          )}
        </Field>
      </div>
      <RadioGroup legend={t("form.role")}>
        {staffRoles.map((role) => (
          <Radio
            key={role}
            name="role"
            value={role}
            label={t(`roles.${role}`)}
            description={t(`roleHints.${role}`)}
            defaultChecked={values.role === role}
          />
        ))}
      </RadioGroup>
      {error("role") ? <p className="text-sm text-danger-700">{error("role")}</p> : null}
      <Button type="submit" loading={pending} className="self-start">
        {t("form.submit")}
      </Button>
    </form>
  );
}
