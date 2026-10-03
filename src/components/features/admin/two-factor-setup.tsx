"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authErrorKey } from "@/components/features/auth/errors";
import { FormError } from "@/components/features/auth/form-error";

type State =
  | { step: "password" }
  | { step: "verify"; qr: string; secret: string; backupCodes: string[] }
  | { step: "backup"; backupCodes: string[] };

/**
 * Slår TOTP-2FA til: password → scan QR-kode → bekræft kode → vis backupkoder.
 * 2FA er først aktiv, når koden er bekræftet.
 */
export function TwoFactorSetup() {
  const t = useTranslations();
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "password" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function showError(apiError: { code?: string; status?: number }) {
    setError(t(`auth.errors.${authErrorKey(apiError)}`, { min: PASSWORD_MIN_LENGTH }));
  }

  async function onPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setError(null);
    if (!password) return setError(t("auth.errors.required"));
    setPending(true);
    const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
    if (error || !data || data.method !== "totp") {
      setPending(false);
      return showError(error ?? {});
    }
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 224 });
    setPending(false);
    setState({ step: "verify", qr, secret, backupCodes: data.backupCodes });
  }

  async function onVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.step !== "verify") return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setError(null);
    if (!code) return setError(t("auth.errors.required"));
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) return showError(error);
    setState({ step: "backup", backupCodes: state.backupCodes });
  }

  if (state.step === "backup") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">{t("admin.security.backupTitle")}</h2>
        <p className="text-muted">{t("admin.security.backupBody")}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-base text-ink-900" dir="ltr">
          {state.backupCodes.map((code) => (
            <li key={code} className="rounded-md bg-ink-50 px-3 py-2">
              {code}
            </li>
          ))}
        </ul>
        <Button
          onClick={() => {
            router.push("/admin");
            router.refresh();
          }}
        >
          {t("admin.security.done")}
        </Button>
      </div>
    );
  }

  if (state.step === "verify") {
    return (
      <form
        onSubmit={onVerify}
        noValidate
        className="flex flex-col gap-4 rounded-lg border border-border bg-white p-6"
      >
        <p className="text-ink-700">{t("admin.security.step2")}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL genereret lokalt */}
        <img
          src={state.qr}
          alt={t("admin.security.qrAlt")}
          width={224}
          height={224}
          className="self-center"
        />
        <p className="text-sm text-muted">
          {t("admin.security.manualKey")}{" "}
          <code className="break-all text-ink-900" dir="ltr">
            {state.secret}
          </code>
        </p>
        <FormError message={error} />
        <Field label={t("auth.fields.code")} required>
          {(props) => (
            <Input {...props} name="code" inputMode="numeric" autoComplete="one-time-code" />
          )}
        </Field>
        <Button type="submit" loading={pending}>
          {t("admin.security.confirm")}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={onPassword}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-border bg-white p-6"
    >
      <p className="text-ink-700">{t("admin.security.step1")}</p>
      <FormError message={error} />
      <Field label={t("auth.fields.password")} required>
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="current-password" />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        {t("admin.security.start")}
      </Button>
    </form>
  );
}
