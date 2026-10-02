"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import type { ConsentState, DeleteState } from "@/app/[locale]/account/privacy/actions";

type Action<State> = (state: State, formData: FormData) => Promise<State>;

/** Privatlivscenter (08-komponenter: PrivacyCenter): samtykker, dataeksport og sletning. */
export function PrivacyCenter({
  consents,
  blocker,
  homeHref,
  saveConsents,
  deleteAccount,
}: {
  consents: { marketing: boolean; whatsapp: boolean };
  blocker: "ACTIVE_BOOKING" | "OPEN_CLAIM" | null;
  homeHref: string;
  saveConsents: Action<ConsentState>;
  deleteAccount: Action<DeleteState>;
}) {
  const t = useTranslations("account.privacy");
  const [consentState, consentAction, savingConsents] = useActionState(saveConsents, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteAccount, {});

  if (deleteState.status === "deleted") {
    return (
      <Alert tone="success" title={t("delete.done")}>
        <a href={homeHref} className="font-medium underline">
          {t("delete.home")}
        </a>
      </Alert>
    );
  }
  const reason = deleteState.reason ?? blocker;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink-900">{t("consents.title")}</h2>
          <form action={consentAction} className="flex flex-col gap-4">
            {consentState.status === "saved" ? (
              <Alert tone="success">{t("consents.saved")}</Alert>
            ) : null}
            {consentState.status === "error" ? <Alert tone="danger">{t("error")}</Alert> : null}
            <Checkbox
              name="marketing"
              defaultChecked={consents.marketing}
              label={t("consents.marketing")}
              description={t("consents.marketingHint")}
            />
            <Checkbox
              name="whatsapp"
              defaultChecked={consents.whatsapp}
              label={t("consents.whatsapp")}
              description={t("consents.whatsappHint")}
            />
            <Button
              type="submit"
              variant="secondary"
              loading={savingConsents}
              className="self-start"
            >
              {t("consents.save")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink-900">{t("export.title")}</h2>
          <p className="text-base text-ink-700">{t("export.body")}</p>
          <a
            href="/api/account/export"
            download
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-md border border-ink-300 bg-white px-4 font-medium text-ink-900 hover:border-ink-400 hover:bg-ink-50"
          >
            <Download className="size-4" aria-hidden />
            {t("export.download")}
          </a>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink-900">{t("delete.title")}</h2>
          <p className="text-base text-ink-700">{t("delete.body")}</p>
          {reason ? (
            <Alert tone="warning">{t(`delete.blocked.${reason}`)}</Alert>
          ) : (
            <form action={deleteAction} className="flex flex-col gap-4">
              {deleteState.status === "error" ? <Alert tone="danger">{t("error")}</Alert> : null}
              <Checkbox
                name="confirm"
                label={t("delete.confirm")}
                aria-invalid={deleteState.status === "confirm" || undefined}
              />
              {deleteState.status === "confirm" ? (
                <p className="text-sm font-medium text-danger-700" role="alert">
                  {t("delete.confirmRequired")}
                </p>
              ) : null}
              <Button type="submit" variant="danger" loading={deleting} className="self-start">
                {t("delete.submit")}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
