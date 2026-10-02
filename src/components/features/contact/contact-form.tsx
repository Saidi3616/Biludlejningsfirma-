"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { ContactState } from "@/app/[locale]/contact/actions";

type Action = (state: ContactState, formData: FormData) => Promise<ContactState>;

type FieldWithError = "name" | "email" | "phone" | "message";

export function ContactForm({ action }: { action: Action }) {
  const t = useTranslations("contact.form");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  if (state.status === "success") {
    return <Alert tone="success">{t("success")}</Alert>;
  }

  const invalid = (name: FieldWithError) =>
    state.fields?.includes(name) ? t(`fieldErrors.${name}`) : undefined;
  const value = (name: string) => state.values?.[name] ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.error ? (
        <Alert tone="danger">{t(`errors.${state.error}`)}</Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} required error={invalid("name")}>
          {(props) => (
            <Input name="name" autoComplete="name" defaultValue={value("name")} {...props} />
          )}
        </Field>
        <Field label={t("email")} required error={invalid("email")}>
          {(props) => (
            <Input
              type="email"
              name="email"
              autoComplete="email"
              defaultValue={value("email")}
              {...props}
            />
          )}
        </Field>
        <Field label={t("phone")} error={invalid("phone")}>
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
        <Field label={t("subject")}>
          {(props) => <Input name="subject" defaultValue={value("subject")} {...props} />}
        </Field>
      </div>
      <Field label={t("message")} required error={invalid("message")}>
        {(props) => <Textarea name="message" rows={6} defaultValue={value("message")} {...props} />}
      </Field>
      {/* Fælde for robotter: skjult for mennesker og skærmlæsere. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>
          {t("website")}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p className="text-sm text-muted">{t("privacy")}</p>
      <Button type="submit" loading={pending} className="self-start">
        <Send aria-hidden />
        {t("submit")}
      </Button>
    </form>
  );
}
