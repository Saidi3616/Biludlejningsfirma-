import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { FUEL_EIGHTHS } from "@/lib/validation/inspections";
import type { HandoverContext } from "@/server/inspections/service";

export const HANDOVER_NOTICES = [
  "invalid",
  "odometerDown",
  "unpaid",
  "tooEarly",
  "depositMissing",
  "conflict",
  "forbidden",
  "notFound",
  "failed",
] as const;
export type HandoverNotice = (typeof HANDOVER_NOTICES)[number];

/**
 * Udlevering (F1) eller aflevering (F2): km, brændstof og bemærkninger. Fotos og skader
 * registreres på inspektionen bagefter. Mobilvenlig: bruges ved bilen.
 */
export async function HandoverForm({
  type,
  booking,
  action,
  notice,
}: {
  type: "pickup" | "return";
  booking: HandoverContext;
  action: (formData: FormData) => Promise<void>;
  notice: HandoverNotice | null;
}) {
  const t = await getTranslations("admin.handover");
  const tArea = await getTranslations("admin.damage.areas");
  const tSeverity = await getTranslations("admin.damage.severities");
  const zone = booking.pickupLocation.timezone;
  const pickup = booking.inspections.find((inspection) => inspection.type === "PICKUP");
  const allowed = type === "pickup" ? booking.status === "CONFIRMED" : booking.status === "ACTIVE";
  const minimumKm = Math.max(booking.car.odometerKm, pickup?.odometerKm ?? 0);

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
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t(`${type}.title`)}</h1>
        <p className="text-muted">
          {booking.customer.firstName} {booking.customer.lastName} · {booking.carModel.brand}{" "}
          {booking.carModel.model} · {booking.car.registrationNumber}
        </p>
        <p className="text-sm text-muted">
          {formatDateTime(booking.pickupAt, "da", zone)} –{" "}
          {formatDateTime(booking.returnAt, "da", zone)}
        </p>
      </div>

      {notice ? <Alert tone="danger">{t(`notices.${notice}`)}</Alert> : null}

      {!allowed ? (
        <Alert tone="warning">{t(`${type}.notAllowed`)}</Alert>
      ) : (
        <>
          {type === "pickup" && booking.depositStatus === "PENDING" ? (
            <Alert tone="warning" title={t("pickup.depositTitle")}>
              <span className="flex flex-col items-start gap-3">
                <span>
                  {t("pickup.deposit")}{" "}
                  <Price amountMinor={booking.depositMinor} currency={booking.currency} />
                </span>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/admin/bookings/${booking.reference}/deposit`}>
                    {t("pickup.takeDeposit")}
                  </Link>
                </Button>
              </span>
            </Alert>
          ) : null}

          {type === "pickup" && booking.balanceMinor > 0 ? (
            <Alert tone="warning" title={t("pickup.unpaidTitle")}>
              {t("pickup.unpaid")}{" "}
              <Price amountMinor={booking.balanceMinor} currency={booking.currency} />
            </Alert>
          ) : null}

          <section aria-labelledby="known-damages" className="flex flex-col gap-2">
            <h2 id="known-damages" className="text-lg font-semibold text-ink-900">
              {t("knownDamages")}
            </h2>
            {booking.car.damages.length === 0 ? (
              <p className="text-muted">{t("noKnownDamages")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {booking.car.damages.map((damage) => (
                  <li
                    key={damage.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-white p-3"
                  >
                    <Badge tone="warning">{tArea(damage.area as "front")}</Badge>
                    <Badge>{tSeverity(damage.severity)}</Badge>
                    <span className="text-ink-900">{damage.description}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted">{t(`${type}.damagesHint`)}</p>
          </section>

          <Card>
            <CardBody>
              <form action={action} className="flex flex-col gap-5">
                <input type="hidden" name="reference" value={booking.reference} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("odometer")} hint={t("odometerHint", { km: minimumKm })} required>
                    {(field) => (
                      <Input
                        name="odometerKm"
                        inputMode="numeric"
                        defaultValue={String(minimumKm)}
                        {...field}
                      />
                    )}
                  </Field>
                  <Field label={t("fuel")} hint={t("fuelHint")} required>
                    {(field) => (
                      <Select name="fuelLevel" defaultValue={String(FUEL_EIGHTHS)} {...field}>
                        {Array.from(
                          { length: FUEL_EIGHTHS + 1 },
                          (_, level) => FUEL_EIGHTHS - level,
                        ).map((level) => (
                          <option key={level} value={level}>
                            {t("fuelLevel", { level, max: FUEL_EIGHTHS })}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                {type === "return" ? (
                  <RadioGroup legend={t("return.carStatus")}>
                    <Radio
                      name="carStatus"
                      value="ACTIVE"
                      defaultChecked
                      label={t("return.statuses.ACTIVE")}
                    />
                    <Radio
                      name="carStatus"
                      value="INSPECTION"
                      label={t("return.statuses.INSPECTION")}
                    />
                    <Radio
                      name="carStatus"
                      value="MAINTENANCE"
                      label={t("return.statuses.MAINTENANCE")}
                    />
                  </RadioGroup>
                ) : null}
                <Field label={t("notes")} hint={t("notesHint")}>
                  {(field) => <Textarea name="notes" rows={2} {...field} />}
                </Field>
                <Button type="submit" className="self-start">
                  {t(`${type}.submit`)}
                </Button>
              </form>
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
