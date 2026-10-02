"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import type { CancelState } from "@/app/[locale]/booking/[reference]/actions";

type Action = (state: CancelState, formData: FormData) => Promise<CancelState>;

/** Annullering kræver et flueben, så den ikke sker ved et uheld. Virker uden JavaScript. */
export function CancelForm({
  action,
  reference,
  locale,
  from,
}: {
  action: Action;
  reference: string;
  locale: string;
  from: "account" | "booking";
}) {
  const t = useTranslations("manage.cancel");
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="from" value={from} />
      {state.error ? <Alert tone="danger">{t(`errors.${state.error}`)}</Alert> : null}
      <Checkbox name="confirm" label={t("confirm")} required />
      <Button type="submit" variant="danger" disabled={pending} className="self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
