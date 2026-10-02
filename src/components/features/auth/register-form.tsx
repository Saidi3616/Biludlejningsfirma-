"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authErrorKey, EMAIL_PATTERN } from "./errors";
import { FormError } from "./form-error";

type FieldErrors = { name?: string; email?: string; password?: string };

export function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale() as Locale;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const errors: FieldErrors = {};
    if (!name) errors.name = t("errors.nameRequired");
    if (!EMAIL_PATTERN.test(email)) errors.email = t("errors.emailInvalid");
    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.password = t("errors.passwordTooShort", { min: PASSWORD_MIN_LENGTH });
    }
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      locale,
      callbackURL: localizedPath(locale, "/verify-email"),
    });
    setPending(false);
    if (error) {
      setError(t(`errors.${authErrorKey(error)}`, { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Alert tone="success" title={t("register.sentTitle")}>
        {t("register.sentBody", { email: sentTo })}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label={t("fields.name")} error={fieldErrors.name} required>
        {(props) => <Input {...props} name="name" autoComplete="name" />}
      </Field>
      <Field label={t("fields.email")} error={fieldErrors.email} required>
        {(props) => <Input {...props} name="email" type="email" autoComplete="email" />}
      </Field>
      <Field
        label={t("fields.password")}
        hint={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}
        error={fieldErrors.password}
        required
      >
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="new-password" />
        )}
      </Field>
      <Button type="submit" loading={pending} fullWidth>
        {t("register.submit")}
      </Button>
      <p className="text-center text-sm text-muted">
        {t("register.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-brand-700 underline">
          {t("register.login")}
        </Link>
      </p>
    </form>
  );
}
