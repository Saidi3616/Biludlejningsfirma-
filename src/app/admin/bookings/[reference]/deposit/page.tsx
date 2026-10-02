import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { StripePaymentForm } from "@/components/features/booking/stripe-payment-form";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { depositMethods } from "@/lib/validation/admin";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { startDeposit, type StartedDeposit } from "@/server/payments/deposits";
import { manualDepositAction, simulateDepositAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.deposit" });
  return { title: t("title") };
}

const NOTICES = ["held", "card", "invalid", "conflict", "forbidden", "failed"] as const;

/**
 * Depositum ved udlevering (F1, K6). Kunden indtaster kortet på personalets skærm, eller
 * depositummet modtages kontant eller på terminalen.
 */
export default async function DepositPage({
  params,
  searchParams,
}: PageProps<"/admin/bookings/[reference]/deposit">) {
  setRequestLocale("da");
  await requirePermission("booking:write");
  const [{ reference }, search] = await Promise.all([params, searchParams]);
  const booking = await db.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    select: {
      id: true,
      reference: true,
      status: true,
      depositStatus: true,
      depositMinor: true,
      currency: true,
      customer: { select: { firstName: true, lastName: true } },
      payments: {
        where: { kind: "DEPOSIT_HOLD" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });
  if (!booking) notFound();
  const t = await getTranslations("admin.deposit");
  const tMethods = await getTranslations("admin.booking.methods");
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const due = booking.status === "CONFIRMED" && booking.depositStatus === "PENDING";

  let deposit: StartedDeposit | null = null;
  let unavailable = false;
  if (due) {
    try {
      deposit = await startDeposit(await getPolicyContext(), booking.id);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "SERVICE_UNAVAILABLE") throw error;
      unavailable = true;
    }
  }
  const price = formatMoney(booking.depositMinor, booking.currency, "da");
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const returnUrl = new URL(
    `/admin/bookings/${booking.reference}/deposit?notice=card`,
    process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ).toString();
  const lastFailed = booking.payments[0]?.status === "FAILED";

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
          {booking.customer.firstName} {booking.customer.lastName} ·{" "}
          <Price amountMinor={booking.depositMinor} currency={booking.currency} />
        </p>
      </div>

      {notice && notice !== "held" && notice !== "card" ? (
        <Alert tone="danger">{t(`notices.${notice}`)}</Alert>
      ) : null}
      {lastFailed && due ? <Alert tone="danger">{t("declined")}</Alert> : null}

      {booking.depositStatus === "HELD" ? (
        <>
          <Alert tone="success">{t("held")}</Alert>
          {booking.status === "CONFIRMED" ? (
            <Button asChild className="self-start">
              <Link href={`/admin/bookings/${booking.reference}/pickup`}>
                <KeyRound aria-hidden />
                {t("toPickup")}
              </Link>
            </Button>
          ) : null}
        </>
      ) : !due ? (
        <Alert tone="info">{t("notDue")}</Alert>
      ) : (
        <>
          {notice === "card" ? <Alert tone="info">{t("waiting")}</Alert> : null}
          <section aria-labelledby="card" className="flex flex-col gap-3">
            <h2 id="card" className="text-lg font-semibold text-ink-900">
              {t("cardTitle")}
            </h2>
            <p className="text-sm text-muted">
              {deposit?.isAuthorization ? t("cardHold") : t("cardCharge")}
            </p>
            <Card>
              <CardBody className="flex flex-col gap-4">
                {unavailable || !deposit ? (
                  <Alert tone="warning">{t("unavailable")}</Alert>
                ) : deposit.provider === "stripe" && publishableKey ? (
                  <StripePaymentForm
                    publishableKey={publishableKey}
                    clientSecret={deposit.clientSecret}
                    returnUrl={returnUrl}
                    payLabel={t("cardSubmit", { price })}
                  />
                ) : deposit.provider === "fake" ? (
                  <form action={simulateDepositAction} className="flex flex-col gap-3">
                    <p className="text-sm text-muted">{t("testBody")}</p>
                    <input type="hidden" name="reference" value={booking.reference} />
                    <Button type="submit" className="self-start">
                      {t("cardSubmit", { price })}
                    </Button>
                  </form>
                ) : (
                  <Alert tone="warning">{t("unavailable")}</Alert>
                )}
              </CardBody>
            </Card>
          </section>

          <section aria-labelledby="manual" className="flex flex-col gap-3">
            <h2 id="manual" className="text-lg font-semibold text-ink-900">
              {t("manualTitle")}
            </h2>
            <p className="text-sm text-muted">{t("manualHint")}</p>
            <Card>
              <CardBody>
                <form action={manualDepositAction} className="flex flex-col gap-4">
                  <input type="hidden" name="reference" value={booking.reference} />
                  <Field label={t("method")} required>
                    {(field) => (
                      <Select name="method" defaultValue="CASH" {...field}>
                        {depositMethods.map((method) => (
                          <option key={method} value={method}>
                            {method === "CARD" ? t("terminal") : tMethods(method)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Button type="submit" variant="secondary" className="self-start">
                    {t("manualSubmit", { price })}
                  </Button>
                </form>
              </CardBody>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
