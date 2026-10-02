import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, FileText, KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/features/admin/signature-pad";
import { formatDateTime } from "@/lib/format";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { contractContext } from "@/server/contracts/service";
import { db } from "@/server/db";
import { signContractAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.contract" });
  return { title: t("title") };
}

const NOTICES = [
  "signed",
  "invalid",
  "signatureMissing",
  "conflict",
  "forbidden",
  "failed",
] as const;

/**
 * Lejekontrakten ved udleveringen (F1): personalet gennemgår PDF'en med kunden, og kunden
 * skriver sit navn og underskriver på skærmen. Derefter kan bilen udleveres.
 */
export default async function ContractPage({
  params,
  searchParams,
}: PageProps<"/admin/bookings/[reference]/contract">) {
  setRequestLocale("da");
  await requirePermission("booking:write");
  const [{ reference }, search] = await Promise.all([params, searchParams]);
  const found = await db.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    select: { id: true },
  });
  if (!found) notFound();
  const booking = await contractContext(await getPolicyContext(), found.id);
  const t = await getTranslations("admin.contract");
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const contract = booking.contract?.signedAt ? booking.contract : null;
  const zone = booking.pickupLocation.timezone;
  const pdfHref = `/admin/bookings/${booking.reference}/contract/pdf`;

  return (
    <>
      <Link
        href={`/admin/bookings/${booking.reference}`}
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back", { reference: booking.reference })}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        <p className="text-muted">
          {booking.customer.firstName} {booking.customer.lastName}
        </p>
      </div>

      {notice && notice !== "signed" ? <Alert tone="danger">{t(`notices.${notice}`)}</Alert> : null}

      {contract ? (
        <>
          <Alert tone="success">
            {t("signed", {
              name: contract.signerName ?? "",
              date: formatDateTime(contract.signedAt!, "da", zone),
            })}
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <a href={pdfHref} target="_blank" rel="noopener">
                <FileText aria-hidden />
                {t("download")}
              </a>
            </Button>
            {booking.status === "CONFIRMED" ? (
              <Button asChild>
                <Link href={`/admin/bookings/${booking.reference}/pickup`}>
                  <KeyRound aria-hidden />
                  {t("toPickup")}
                </Link>
              </Button>
            ) : null}
          </div>
        </>
      ) : booking.status !== "CONFIRMED" ? (
        <Alert tone="info">{t("notDue")}</Alert>
      ) : (
        <>
          <p className="text-muted">{t("intro")}</p>
          <Button asChild variant="secondary" className="self-start">
            <a href={pdfHref} target="_blank" rel="noopener">
              <FileText aria-hidden />
              {t("preview")}
            </a>
          </Button>
          <Card>
            <CardBody>
              <form action={signContractAction} className="flex flex-col gap-5">
                <input type="hidden" name="reference" value={booking.reference} />
                <Field label={t("signerName")} hint={t("signerHint")} required>
                  {(field) => (
                    <Input
                      name="signerName"
                      autoComplete="off"
                      defaultValue={`${booking.customer.firstName} ${booking.customer.lastName}`}
                      maxLength={120}
                      {...field}
                    />
                  )}
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span id="signature-label" className="text-sm font-medium text-ink-900">
                    {t("signature")}
                  </span>
                  <SignaturePad name="signature" labelId="signature-label" />
                </div>
                <Checkbox name="accept" required label={t("accept")} />
                <Button type="submit" className="self-start">
                  {t("submit")}
                </Button>
              </form>
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
