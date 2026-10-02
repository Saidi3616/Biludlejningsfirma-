"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { ReviewFormState } from "@/app/[locale]/reviews/new/actions";

type Action = (state: ReviewFormState, formData: FormData) => Promise<ReviewFormState>;

/** Anmeldelse (E8): stjerner som radioknapper, så de kan vælges med tastatur og skærmlæser. */
export function ReviewForm({
  action,
  token,
  displayName,
}: {
  action: Action;
  token: string;
  displayName: string;
}) {
  const t = useTranslations("reviews.new");
  const [state, formAction, pending] = useActionState(action, {});

  if (state.done) {
    return (
      <Alert tone="success" title={t("thanks")}>
        {t("thanksBody")}
      </Alert>
    );
  }
  if (state.error === "closed") return <Alert tone="info">{t("done")}</Alert>;

  const values = state.values ?? { displayName };
  const error = (name: "rating" | "comment" | "displayName") =>
    state.fields?.includes(name) ? t(`errors.${name}`) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert tone="danger">{t(`notices.${state.error}`)}</Alert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-900">
          {t("rating")}
          <span className="text-danger-600" aria-hidden>
            {" "}
            *
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((count) => (
            <label
              key={count}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-ink-300 bg-white px-3",
                "has-[:checked]:bg-accent-50 has-[:checked]:border-accent-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-700",
              )}
            >
              <input
                type="radio"
                name="rating"
                value={count}
                defaultChecked={values.rating === String(count)}
                className="sr-only"
              />
              <Star aria-hidden className="size-4 fill-accent-500 text-accent-500" />
              <span>{t("stars", { count })}</span>
            </label>
          ))}
        </div>
        {error("rating") ? (
          <p className="text-sm font-medium text-danger-700" role="alert">
            {error("rating")}
          </p>
        ) : null}
      </fieldset>
      <Field label={t("comment")} hint={t("commentHint")} error={error("comment")}>
        {(field) => (
          <Textarea
            name="comment"
            rows={4}
            maxLength={1000}
            defaultValue={values.comment ?? ""}
            {...field}
          />
        )}
      </Field>
      <Field
        label={t("displayName")}
        hint={t("displayNameHint")}
        required
        error={error("displayName")}
      >
        {(field) => <Input name="displayName" defaultValue={values.displayName ?? ""} {...field} />}
      </Field>
      <Button type="submit" variant="cta" loading={pending} className="self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
