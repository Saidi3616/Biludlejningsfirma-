"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authErrorKey, EMAIL_PATTERN } from "./errors";
import { FormError } from "./form-error";

/** Svaret er det samme, uanset om e-mailen har en konto (ingen afsløring af konti). */
export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string>();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setError(null);
    setEmailError(EMAIL_PATTERN.test(email) ? undefined : t("errors.emailInvalid"));
    if (!EMAIL_PATTERN.test(email)) return;

    setPending(true);
    const { error } = await authClient.requestPasswordReset({ email });
    setPending(false);
    if (error) {
      setError(t(`errors.${authErrorKey(error)}`, { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title={t("forgot.sentTitle")}>
          {t("forgot.sentBody", { email: sentTo })}
        </Alert>
        <Link href="/login" className="text-sm font-medium text-brand-700 underline">
          {t("forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label={t("fields.email")} error={emailError} required>
        {(props) => <Input {...props} name="email" type="email" autoComplete="email" />}
      </Field>
      <Button type="submit" loading={pending} fullWidth>
        {t("forgot.submit")}
      </Button>
      <Link href="/login" className="text-center text-sm font-medium text-brand-700 underline">
        {t("forgot.backToLogin")}
      </Link>
    </form>
  );
}
