import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { feeRates, rentalRules } from "@/config/rental";
import { DamageLiability } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { formatDateTime, formatMoney, minorToInput } from "@/lib/format";
import { FUEL_EIGHTHS } from "@/lib/validation/inspections";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { settlementContext } from "@/server/payments/settlement";
import { settleAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.settlement" });
  return { title: t("title") };
}

const NOTICES = ["settled", "invalid", "conflict", "forbidden", "provider", "failed"] as const;
const LIABILITIES = Object.values(DamageLiability).filter((value) => value !== "UNDECIDED");

/**
 * Afregning efter aflevering (F2): systemet foreslår tillæg for ekstra km, brændstof og for sen
 * aflevering; en leder godkender ansvar og beløb for nye skader. Tillæggene trækkes fra
 * depositummet, og resten frigives.
 */
export default async function SettlePage({
  params,
  searchParams,
}: PageProps<"/admin/bookings/[reference]/settle">) {
  setRequestLocale("da");
  await requirePermission("booking:write");
  const [{ reference }, search] = await Promise.all([params, searchParams]);
  const found = await db.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    select: { id: true },
  });
  if (!found) notFound();
  let booking;
  try {
    booking = await settlementContext(await getPolicyContext(), found.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [t, tArea, tSeverity, tLiability] = await Promise.all([
    getTranslations("admin.settlement"),
    getTranslations("admin.damage.areas"),
    getTranslations("admin.damage.severities"),
    getTranslations("admin.damage.liabilities"),
  ]);
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const { fees } = booking;
  const zone = booking.returnLocation.timezone;
  const sum = (kind: string) =>
    booking.payments
      .filter((payment) => payment.kind === kind && payment.status === "SUCCEEDED")
      .reduce((total, payment) => total + payment.amountMinor, 0);
  const cashBack = booking.payments
    .filter((payment) => payment.kind === "DEPOSIT_RETURN" && payment.provider === "manual")
    .reduce((total, payment) => total + payment.amountMinor, 0);
  const money = (amountMinor: number) => (
    <Price amountMinor={amountMinor} currency={booking.currency} />
  );

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
          {booking.customer.firstName} {booking.customer.lastName} · {booking.carModel.brand}{" "}
          {booking.carModel.model} · {booking.car.registrationNumber}
        </p>
      </div>

      {notice && notice !== "settled" ? (
        <Alert tone="danger">{t(`notices.${notice}`)}</Alert>
      ) : null}

      {booking.settledAt ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <Alert tone="success">
              {t("settledAt", { date: formatDateTime(booking.settledAt, "da", zone) })}
            </Alert>
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-700">{t("captured")}</dt>
                <dd className="font-medium text-ink-900">{money(sum("DEPOSIT_CAPTURE"))}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-700">{t("returned")}</dt>
                <dd className="font-medium text-ink-900">{money(sum("DEPOSIT_RETURN"))}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold">
                <dt>{t("balance")}</dt>
                <dd>{money(Math.max(0, booking.balanceMinor))}</dd>
              </div>
            </dl>
            {cashBack > 0 ? (
              <Alert tone="warning">
                {t("cashBack", { amount: formatMoney(cashBack, booking.currency, "da") })}
              </Alert>
            ) : null}
            {booking.balanceMinor > 0 ? <p className="text-sm text-muted">{t("owed")}</p> : null}
          </CardBody>
        </Card>
      ) : booking.status !== "COMPLETED" || !fees ? (
        <Alert tone="info">{t("notReturned")}</Alert>
      ) : (
        <form action={settleAction} className="flex flex-col gap-6">
          <input type="hidden" name="reference" value={booking.reference} />

          <section aria-labelledby="fees" className="flex flex-col gap-3">
            <h2 id="fees" className="text-lg font-semibold text-ink-900">
              {t("feesTitle")}
            </h2>
            <p className="text-sm text-muted">{t("feesHint")}</p>
            <Card>
              <CardBody className="grid gap-4 sm:grid-cols-3">
                <Field
                  label={t("extraKm")}
                  hint={t("extraKmHint", {
                    driven: fees.drivenKm,
                    included: fees.includedKm,
                    extra: fees.extraKm.quantity,
                    rate: minorToInput(fees.extraKm.unitPriceMinor),
                  })}
                >
                  {(field) => (
                    <Input
                      name="extraKm"
                      inputMode="decimal"
                      defaultValue={minorToInput(fees.extraKm.totalMinor)}
                      {...field}
                    />
                  )}
                </Field>
                <Field
                  label={t("fuel")}
                  hint={t("fuelHint", {
                    pickup: booking.pickup!.fuelLevel,
                    returned: booking.returned!.fuelLevel,
                    max: FUEL_EIGHTHS,
                    rate: minorToInput(feeRates.fuelPerEighthMinor),
                  })}
                >
                  {(field) => (
                    <Input
                      name="fuel"
                      inputMode="decimal"
                      defaultValue={minorToInput(fees.fuel.totalMinor)}
                      {...field}
                    />
                  )}
                </Field>
                <Field
                  label={t("late")}
                  hint={t("lateHint", {
                    minutes: fees.late.minutesLate,
                    grace: rentalRules.graceMinutes,
                    hours: fees.late.quantity,
                    rate: minorToInput(feeRates.latePerHourMinor),
                  })}
                >
                  {(field) => (
                    <Input
                      name="late"
                      inputMode="decimal"
                      defaultValue={minorToInput(fees.late.totalMinor)}
                      {...field}
                    />
                  )}
                </Field>
              </CardBody>
            </Card>
          </section>

          <section aria-labelledby="damages" className="flex flex-col gap-3">
            <h2 id="damages" className="text-lg font-semibold text-ink-900">
              {t("damagesTitle")}
            </h2>
            {booking.damages.length === 0 ? (
              <p className="text-muted">{t("noDamages")}</p>
            ) : (
              <>
                <p className="text-sm text-muted">{t("damagesHint")}</p>
                {booking.needsManager ? <Alert tone="warning">{t("needsManager")}</Alert> : null}
                <ul className="flex flex-col gap-3">
                  {booking.damages.map((damage) => (
                    <li key={damage.id}>
                      <Card>
                        <CardBody className="flex flex-col gap-3">
                          <input type="hidden" name="damageId" value={damage.id} />
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-ink-900">
                              {tArea(damage.area as "front")}
                            </h3>
                            <Badge>{tSeverity(damage.severity)}</Badge>
                          </div>
                          <p className="text-ink-900">{damage.description}</p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={t("liability")} required>
                              {(field) => (
                                <Select
                                  name={`liability-${damage.id}`}
                                  defaultValue={
                                    damage.liability === "UNDECIDED" ? "" : damage.liability
                                  }
                                  disabled={booking.needsManager}
                                  {...field}
                                >
                                  <option value="">{t("chooseLiability")}</option>
                                  {LIABILITIES.map((liability) => (
                                    <option key={liability} value={liability}>
                                      {tLiability(liability)}
                                    </option>
                                  ))}
                                </Select>
                              )}
                            </Field>
                            <Field label={t("damageAmount")} hint={t("damageAmountHint")}>
                              {(field) => (
                                <Input
                                  name={`amount-${damage.id}`}
                                  inputMode="decimal"
                                  defaultValue={
                                    damage.estimatedCostMinor !== null
                                      ? minorToInput(damage.estimatedCostMinor)
                                      : ""
                                  }
                                  disabled={booking.needsManager}
                                  {...field}
                                />
                              )}
                            </Field>
                          </div>
                        </CardBody>
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-labelledby="deposit" className="flex flex-col gap-3">
            <h2 id="deposit" className="text-lg font-semibold text-ink-900">
              {t("depositTitle")}
            </h2>
            <p className="text-ink-900">
              {booking.heldMinor > 0
                ? t("depositHeld", {
                    amount: formatMoney(booking.heldMinor, booking.currency, "da"),
                  })
                : t("noDeposit")}
            </p>
            {booking.balanceMinor < 0 ? (
              <p className="text-sm text-muted">
                {t("credit", {
                  amount: formatMoney(-booking.balanceMinor, booking.currency, "da"),
                })}
              </p>
            ) : null}
          </section>

          {booking.needsManager ? null : (
            <Button type="submit" className="self-start">
              {t("submit")}
            </Button>
          )}
        </form>
      )}
    </>
  );
}
