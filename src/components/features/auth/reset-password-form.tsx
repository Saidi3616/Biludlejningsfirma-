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
import { authErrorKey, type AuthErrorKey } from "./errors";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const [passwordError, setPasswordError] = useState<string>();
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get("password") ?? "");
    setErrorKey(null);
    const tooShort = newPassword.length < PASSWORD_MIN_LENGTH;
    setPasswordError(
      tooShort ? t("errors.passwordTooShort", { min: PASSWORD_MIN_LENGTH }) : undefined,
    );
    if (tooShort) return;

    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) {
      setErrorKey(authErrorKey(error));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title={t("reset.doneTitle")}>
          {t("reset.doneBody")}
        </Alert>
        <Button asChild fullWidth>
          <Link href="/login">{t("reset.login")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {errorKey ? (
        <Alert tone="danger">
          {t(`errors.${errorKey}`, { min: PASSWORD_MIN_LENGTH })}{" "}
          {errorKey === "invalidToken" ? (
            <Link href="/forgot-password" className="font-medium text-brand-700 underline">
              {t("reset.requestNew")}
            </Link>
          ) : null}
        </Alert>
      ) : null}
      <Field
        label={t("fields.newPassword")}
        hint={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}
        error={passwordError}
        required
      >
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="new-password" />
        )}
      </Field>
      <Button type="submit" loading={pending} fullWidth>
        {t("reset.submit")}
      </Button>
    </form>
  );
}
