"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authErrorKey, EMAIL_PATTERN } from "./errors";
import { FormError } from "./form-error";

type Step = "password" | "totp" | "backup";

/**
 * Login i to trin: e-mail + password, derefter 2FA-kode hvis brugeren har slået det til.
 * Efter login hentes siden helt på ny, så serveren læser den nye session-cookie.
 */
export function LoginForm({ next }: { next: string | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("password");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  function done() {
    window.location.assign(next ?? localizedPath(locale as never, "/account"));
  }

  async function onPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const errors: typeof fieldErrors = {};
    if (!EMAIL_PATTERN.test(email)) errors.email = t("errors.emailInvalid");
    if (!password) errors.password = t("errors.required");
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    const { data, error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      setError(t(`errors.${authErrorKey(error)}`, { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setStep("totp");
      return;
    }
    done();
  }

  async function onCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setError(null);
    if (!code) {
      setError(t("errors.required"));
      return;
    }
    setPending(true);
    const { error } =
      step === "totp"
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    setPending(false);
    if (error) {
      setError(t(`errors.${authErrorKey(error)}`, { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    done();
  }

  if (step !== "password") {
    return (
      <form onSubmit={onCode} noValidate className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{t("login.twoFactorTitle")}</h2>
          <p className="mt-1 text-muted">
            {step === "totp" ? t("login.twoFactorIntro") : t("login.backupIntro")}
          </p>
        </div>
        <FormError message={error} />
        <Field label={step === "totp" ? t("fields.code") : t("fields.backupCode")} required>
          {(props) => (
            <Input
              {...props}
              key={step}
              name="code"
              autoComplete="one-time-code"
              inputMode={step === "totp" ? "numeric" : "text"}
              autoFocus
            />
          )}
        </Field>
        <Button type="submit" loading={pending} fullWidth>
          {t("login.verify")}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setError(null);
            setStep(step === "totp" ? "backup" : "totp");
          }}
        >
          {step === "totp" ? t("login.useBackupCode") : t("login.useAuthenticator")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onPassword} noValidate className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label={t("fields.email")} error={fieldErrors.email} required>
        {(props) => <Input {...props} name="email" type="email" autoComplete="email" />}
      </Field>
      <Field label={t("fields.password")} error={fieldErrors.password} required>
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="current-password" />
        )}
      </Field>
      <div className="-mt-1 text-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-700 underline">
          {t("login.forgot")}
        </Link>
      </div>
      <Button type="submit" loading={pending} fullWidth>
        {t("login.submit")}
      </Button>
      <p className="text-center text-sm text-muted">
        {t("login.noAccount")}{" "}
        <Link href="/register" className="font-medium text-brand-700 underline">
          {t("login.register")}
        </Link>
      </p>
    </form>
  );
}
