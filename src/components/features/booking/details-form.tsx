"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Lock } from "lucide-react";
import NextLink from "next/link";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CheckoutState } from "@/app/[locale]/booking/actions";

type FieldErrorKey = "required" | "email" | "phone" | "deliveryAddress" | "acceptTerms";

type Action = (state: CheckoutState, formData: FormData) => Promise<CheckoutState>;

/** Trin 2: kundens oplysninger og accept af vilkår. Opretter reservationen på serveren. */
export function DetailsForm({
  action,
  hidden,
  idempotencyKey,
  needsAddress,
  prefill,
  loginHref,
  backHref,
  searchHref,
  reservationMinutes,
}: {
  action: Action;
  hidden: Record<string, string>;
  idempotencyKey: string;
  needsAddress: boolean;
  prefill: { firstName: string; lastName: string; email: string } | null;
  loginHref: string | null;
  /** Allerede med sprogpræfiks. */
  backHref: string;
  searchHref: string;
  reservationMinutes: number;
}) {
  const t = useTranslations("booking");
  const [state, formAction, pending] = useActionState(action, {});
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const invalid = (name: string, key = name as FieldErrorKey) =>
    state.fields?.includes(name) ? t(`fieldErrors.${key}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {Object.entries(hidden).map(([name, fieldValue]) => (
        <input key={name} type="hidden" name={name} value={fieldValue} />
      ))}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {state.error ? (
        <Alert tone="danger">
          {t(`errors.${state.error}`)}{" "}
          {state.error === "CAR_NO_LONGER_AVAILABLE" ? (
            <NextLink href={searchHref} className="font-medium underline">
              {t("errors.searchAgain")}
            </NextLink>
          ) : null}
        </Alert>
      ) : null}

      {loginHref ? (
        <p className="text-base text-ink-700">
          {t("details.guestNote")}{" "}
          <NextLink href={loginHref} className="font-medium text-brand-700 underline">
            {t("details.login")}
          </NextLink>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("details.firstName")} required error={invalid("firstName", "required")}>
          {(props) => (
            <Input
              name="firstName"
              autoComplete="given-name"
              defaultValue={value("firstName", prefill?.firstName)}
              {...props}
            />
          )}
        </Field>
        <Field label={t("details.lastName")} required error={invalid("lastName", "required")}>
          {(props) => (
            <Input
              name="lastName"
              autoComplete="family-name"
              defaultValue={value("lastName", prefill?.lastName)}
              {...props}
            />
          )}
        </Field>
        <Field label={t("details.email")} required error={invalid("email")}>
          {(props) => (
            <Input
              type="email"
              name="email"
              autoComplete="email"
              defaultValue={value("email", prefill?.email)}
              {...props}
            />
          )}
        </Field>
        <Field
          label={t("details.phone")}
          hint={t("details.phoneHint")}
          required
          error={invalid("phone")}
        >
          {(props) => (
            <Input
              type="tel"
              name="phone"
              autoComplete="tel"
              defaultValue={value("phone")}
              {...props}
            />
          )}
        </Field>
      </div>

      {needsAddress ? (
        <Field
          label={t("details.deliveryAddress")}
          hint={t("details.deliveryAddressHint")}
          required
          error={invalid("deliveryAddress")}
        >
          {(props) => (
            <Input
              name="deliveryAddress"
              autoComplete="street-address"
              defaultValue={value("deliveryAddress")}
              {...props}
            />
          )}
        </Field>
      ) : null}

      <div className="flex flex-col gap-2">
        <Checkbox
          name="acceptTerms"
          defaultChecked={value("acceptTerms") === "on"}
          aria-invalid={state.fields?.includes("acceptTerms") || undefined}
          aria-describedby={state.fields?.includes("acceptTerms") ? "terms-error" : undefined}
          label={t.rich("details.terms", {
            link: (chunks) => (
              <Link href="/terms" target="_blank" className="text-brand-700 underline">
                {chunks}
              </Link>
            ),
          })}
        />
        {state.fields?.includes("acceptTerms") ? (
          <p id="terms-error" className="text-sm text-danger-700">
            {t("fieldErrors.acceptTerms")}
          </p>
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-sm text-muted">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("details.reservedNote", { minutes: reservationMinutes })}
      </p>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button asChild variant="secondary">
          <NextLink href={backHref}>{t("back")}</NextLink>
        </Button>
        <Button type="submit" variant="cta" size="lg" loading={pending}>
          {t("details.submit")}
          <ArrowRight className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
