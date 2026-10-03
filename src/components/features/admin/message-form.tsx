"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { MessageState } from "@/app/admin/bookings/[reference]/actions";

type Action = (state: MessageState, formData: FormData) => Promise<MessageState>;

/** "Send besked" til kunden som e-mail. Formularen tømmes, når beskeden er sendt. */
export function MessageForm({ action, reference }: { action: Action; reference: string }) {
  const t = useTranslations("admin.booking.message");
  const [state, formAction, pending] = useActionState(action, {});
  const invalid = (name: string) => (state.fields?.includes(name) ? t("required") : undefined);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      noValidate
      // Ny nøgle efter afsendelse, så felterne nulstilles.
      key={state.status === "sent" ? "sent" : "draft"}
    >
      <input type="hidden" name="reference" value={reference} />
      {state.status === "sent" ? <Alert tone="success">{t("sent")}</Alert> : null}
      {state.status === "error" && !state.fields?.length ? (
        <Alert tone="danger">{t("error")}</Alert>
      ) : null}
      <Field label={t("subject")} required error={invalid("subject")}>
        {(props) => <Input name="subject" defaultValue={state.values?.subject} {...props} />}
      </Field>
      <Field label={t("body")} hint={t("bodyHint")} required error={invalid("body")}>
        {(props) => <Textarea name="body" rows={6} defaultValue={state.values?.body} {...props} />}
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        <Send aria-hidden />
        {t("submit")}
      </Button>
    </form>
  );
}
