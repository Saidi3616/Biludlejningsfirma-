import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { PhotoGrid } from "@/components/features/admin/photo-grid";
import { PhotoUpload } from "@/components/features/admin/photo-upload";
import { DamageLiability, DamageSeverity } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { damageAreas, FUEL_EIGHTHS } from "@/lib/validation/inspections";
import { inspectionDetail } from "@/server/inspections/service";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import {
  damageAction,
  damagePhotoAction,
  damageRepairedAction,
  inspectionPhotoAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.inspection" });
  return { title: t("metaTitle") };
}

const NOTICES = [
  "pickedUp",
  "returned",
  "damageAdded",
  "damageRepaired",
  "invalid",
  "conflict",
  "forbidden",
  "notFound",
  "failed",
] as const;
const SUCCESS = new Set(["pickedUp", "returned", "damageAdded", "damageRepaired"]);

/** Inspektion ved udlevering eller aflevering: fakta, fotos, skader og sammenligning (F1, F2). */
export default async function InspectionPage({
  params,
  searchParams,
}: PageProps<"/admin/inspections/[id]">) {
  setRequestLocale("da");
  await requirePermission("inspection:write");
  const [{ id }, search] = await Promise.all([params, searchParams]);
  let inspection;
  try {
    inspection = await inspectionDetail(await getPolicyContext(), id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [t, tType, tArea, tSeverity, tLiability] = await Promise.all([
    getTranslations("admin.inspection"),
    getTranslations("admin.inspection.types"),
    getTranslations("admin.damage.areas"),
    getTranslations("admin.damage.severities"),
    getTranslations("admin.damage.liabilities"),
  ]);
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const zone = inspection.timeZone;
  const pickup = inspection.others.find((other) => other.type === "PICKUP");
  const isReturn = inspection.type === "RETURN";
  const fuel = (level: number) => t("fuelLevel", { level, max: FUEL_EIGHTHS });
  const returnTo = `/admin/inspections/${inspection.id}`;

  return (
    <>
      {inspection.booking ? (
        <Link
          href={`/admin/bookings/${inspection.booking.reference}`}
          className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("backToBooking", { reference: inspection.booking.reference })}
        </Link>
      ) : null}

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {tType(inspection.type)}
          {inspection.booking ? ` · ${inspection.booking.reference}` : ""}
        </h1>
        <p className="text-muted">
          {inspection.car.carModel.brand} {inspection.car.carModel.model} ·{" "}
          <Link
            href={`/admin/fleet/cars/${inspection.car.id}`}
            className="text-brand-700 underline"
          >
            {inspection.car.registrationNumber}
          </Link>
          {inspection.booking
            ? ` · ${inspection.booking.customer.firstName} ${inspection.booking.customer.lastName}`
            : ""}
        </p>
      </div>

      {notice ? (
        <Alert tone={SUCCESS.has(notice) ? "success" : "danger"}>{t(`notices.${notice}`)}</Alert>
      ) : null}

      {isReturn && inspection.booking && inspection.booking.settledAt === null ? (
        <Card>
          <CardBody className="flex flex-col items-start gap-3">
            <h2 className="font-semibold text-ink-900">{t("settleTitle")}</h2>
            <p className="text-sm text-muted">{t("settleHint")}</p>
            <Button asChild>
              <Link href={`/admin/bookings/${inspection.booking.reference}/settle`}>
                {t("settle")}
              </Link>
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted">{t("odometer")}</dt>
              <dd className="font-medium text-ink-900">
                {t("km", { km: inspection.odometerKm })}
                {isReturn && pickup ? (
                  <span className="block text-muted">
                    {t("driven", { km: inspection.odometerKm - pickup.odometerKm })}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t("fuel")}</dt>
              <dd className="font-medium text-ink-900">
                {fuel(inspection.fuelLevel)}
                {isReturn && pickup ? (
                  <span className="block text-muted">
                    {t("fuelAtPickup", { fuel: fuel(pickup.fuelLevel) })}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t("performed")}</dt>
              <dd className="font-medium text-ink-900">
                {formatDateTime(inspection.performedAt, "da", zone)}
                {inspection.performedBy ? (
                  <span className="block text-muted">{inspection.performedBy.name}</span>
                ) : null}
              </dd>
            </div>
            {inspection.notes ? (
              <div>
                <dt className="text-muted">{t("notes")}</dt>
                <dd className="text-ink-900">{inspection.notes}</dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      <section aria-labelledby="photos" className="flex flex-col gap-3">
        <h2 id="photos" className="text-lg font-semibold text-ink-900">
          {t("photos")}
        </h2>
        <p className="text-sm text-muted">{t("photosHint")}</p>
        <PhotoGrid
          photos={inspection.photos}
          alt={(n) => t("photoAlt", { n })}
          empty={t("noPhotos")}
        />
        <PhotoUpload
          action={inspectionPhotoAction}
          fields={{ inspectionId: inspection.id }}
          label={t("addPhotos")}
        />
      </section>

      {inspection.others.map((other) => (
        <section
          key={other.id}
          aria-labelledby={`other-${other.id}`}
          className="flex flex-col gap-3"
        >
          <h2 id={`other-${other.id}`} className="text-lg font-semibold text-ink-900">
            {t("compare", { type: tType(other.type) })}
          </h2>
          <p className="text-sm text-muted">
            {formatDateTime(other.performedAt, "da", zone)} · {t("km", { km: other.odometerKm })} ·{" "}
            {fuel(other.fuelLevel)} ·{" "}
            <Link href={`/admin/inspections/${other.id}`} className="text-brand-700 underline">
              {t("open")}
            </Link>
          </p>
          <PhotoGrid
            photos={other.photos}
            alt={(n) => t("otherPhotoAlt", { type: tType(other.type), n })}
            empty={t("noPhotos")}
          />
        </section>
      ))}

      <section id="damages" aria-labelledby="damages-title" className="flex flex-col gap-3">
        <h2 id="damages-title" className="text-lg font-semibold text-ink-900">
          {t("damages")}
        </h2>
        {inspection.damages.length === 0 ? (
          <p className="text-muted">{t("noDamages")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {inspection.damages.map((damage) => (
              <li key={damage.id}>
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink-900">
                        {tArea(damage.area as "front")}
                      </h3>
                      <Badge tone={damage.origin === "NEW" ? "danger" : "warning"}>
                        {damage.origin === "NEW" ? t("newDamage") : t("existingDamage")}
                      </Badge>
                      <Badge>{tSeverity(damage.severity)}</Badge>
                      {damage.origin === "NEW" ? (
                        <Badge tone="info">{tLiability(damage.liability)}</Badge>
                      ) : null}
                      {damage.repairedAt ? <Badge tone="success">{t("repaired")}</Badge> : null}
                    </div>
                    <p className="text-ink-900">{damage.description}</p>
                    {damage.estimatedCostMinor !== null ? (
                      <p className="text-sm text-muted">
                        {t("estimatedCost")}{" "}
                        <Price amountMinor={damage.estimatedCostMinor} currency="DKK" />
                      </p>
                    ) : null}
                    <PhotoGrid
                      photos={damage.photos}
                      alt={(n) => t("damagePhotoAlt", { area: tArea(damage.area as "front"), n })}
                      empty={t("noPhotos")}
                    />
                    <div className="flex flex-wrap items-start gap-3">
                      <PhotoUpload
                        action={damagePhotoAction}
                        fields={{ damageId: damage.id }}
                        label={t("addDamagePhotos")}
                      />
                      {damage.repairedAt === null ? (
                        <form action={damageRepairedAction}>
                          <input type="hidden" name="damageId" value={damage.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Button type="submit" variant="ghost">
                            {t("markRepaired")}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <Card>
          <CardBody className="flex flex-col gap-4">
            <h3 className="font-semibold text-ink-900">{t("addDamage")}</h3>
            <p className="text-sm text-muted">
              {isReturn ? t("addDamageReturn") : t("addDamagePickup")}
            </p>
            <form action={damageAction} className="flex flex-col gap-4">
              <input type="hidden" name="inspectionId" value={inspection.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("area")} required>
                  {(field) => (
                    <Select name="area" {...field}>
                      {damageAreas.map((area) => (
                        <option key={area} value={area}>
                          {tArea(area)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("severity")} required>
                  {(field) => (
                    <Select name="severity" defaultValue="MINOR" {...field}>
                      {Object.values(DamageSeverity).map((severity) => (
                        <option key={severity} value={severity}>
                          {tSeverity(severity)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {isReturn ? (
                  <>
                    <Field label={t("liability")} hint={t("liabilityHint")}>
                      {(field) => (
                        <Select name="liability" defaultValue="UNDECIDED" {...field}>
                          {Object.values(DamageLiability).map((liability) => (
                            <option key={liability} value={liability}>
                              {tLiability(liability)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label={t("estimatedCostLabel")} hint={t("amountHint")}>
                      {(field) => <Input name="estimatedCost" inputMode="decimal" {...field} />}
                    </Field>
                  </>
                ) : null}
              </div>
              <Field label={t("description")} hint={t("descriptionHint")} required>
                {(field) => <Textarea name="description" rows={2} {...field} />}
              </Field>
              <Button type="submit" variant="secondary" className="self-start">
                {t("saveDamage")}
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>
    </>
  );
}
