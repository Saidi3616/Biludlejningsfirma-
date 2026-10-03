"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { locales } from "@/i18n/routing";
import type { ProfileState } from "@/app/[locale]/account/profile/actions";

type Action = (state: ProfileState, formData: FormData) => Promise<ProfileState>;

export function ProfileForm({
  action,
  email,
  initial,
}: {
  action: Action;
  email: string;
  initial: { firstName: string; lastName: string; phone: string; locale: string };
}) {
  const t = useTranslations("account.profile");
  const tLanguage = useTranslations("language");
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: keyof typeof initial) => state.values?.[name] ?? initial[name];
  const invalid = (name: string, message: string) =>
    state.fields?.includes(name) ? message : undefined;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5" noValidate>
      {state.status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {state.status === "error" && !state.fields?.length ? (
        <Alert tone="danger">{t("error")}</Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("firstName")} required error={invalid("firstName", t("required"))}>
          {(props) => (
            <Input
              name="firstName"
              autoComplete="given-name"
              defaultValue={value("firstName")}
              {...props}
            />
          )}
        </Field>
        <Field label={t("lastName")} required error={invalid("lastName", t("required"))}>
          {(props) => (
            <Input
              name="lastName"
              autoComplete="family-name"
              defaultValue={value("lastName")}
              {...props}
            />
          )}
        </Field>
      </div>
      <Field label={t("email")} hint={t("emailHint")}>
        {(props) => <Input value={email} readOnly disabled {...props} />}
      </Field>
      <Field label={t("phone")} hint={t("phoneHint")} error={invalid("phone", t("phoneError"))}>
        {(props) => (
          <Input
            name="phone"
            type="tel"
            autoComplete="tel"
            dir="ltr"
            defaultValue={value("phone")}
            {...props}
          />
        )}
      </Field>
      <Field label={t("locale")} hint={t("localeHint")}>
        {(props) => (
          <Select name="locale" defaultValue={value("locale")} {...props}>
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {tLanguage(locale)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
