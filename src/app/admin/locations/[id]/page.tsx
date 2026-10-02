import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { CatalogTabs } from "@/components/features/admin/catalog-tabs";
import { LocationForm } from "@/components/features/admin/location-form";
import { AppError } from "@/lib/errors";
import { formatDate, minorToInput, weekdayName } from "@/lib/format";
import { adminLocation } from "@/server/admin/locations";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import {
  addSpecialDayAction,
  removeDeliveryZoneAction,
  removeSpecialDayAction,
  saveDeliveryZoneAction,
  setWeeklyHoursAction,
  updateLocationAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.locations" });
  return { title: t("editTitle") };
}

const NOTICES = [
  "created",
  "saved",
  "hoursSaved",
  "hoursInvalid",
  "daySaved",
  "dayInvalid",
  "dayRemoved",
  "zoneSaved",
  "zoneInvalid",
  "zoneRemoved",
  "forbidden",
  "failed",
] as const;
const FAILURES = new Set(["hoursInvalid", "dayInvalid", "zoneInvalid", "forbidden", "failed"]);

/** Ret en lokation: stamdata, ugens åbningstider, særlige dage og leveringszoner. */
export default async function LocationPage({
  params,
  searchParams,
}: PageProps<"/admin/locations/[id]">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const location = await adminLocation(await getPolicyContext(), id).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const t = await getTranslations("admin.locations");
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const optional = (value: string | null) => value ?? "";

  return (
    <>
      <Link
        href="/admin/locations"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{location.name}</h1>
      <CatalogTabs current="locations" />
      {notice ? (
        <Alert tone={FAILURES.has(notice) ? "danger" : "success"}>{t(`notices.${notice}`)}</Alert>
      ) : null}

      <Card>
        <CardBody>
          <LocationForm
            action={updateLocationAction}
            locationId={location.id}
            defaults={{
              name: location.name,
              slug: location.slug,
              type: location.type,
              address: location.address,
              postalCode: location.postalCode,
              city: location.city,
              country: location.country,
              lat: location.lat,
              lng: location.lng,
              timezone: location.timezone,
              phone: optional(location.phone),
              whatsapp: optional(location.whatsapp),
              email: optional(location.email),
              bufferBeforeMinutes: String(location.bufferBeforeMinutes),
              bufferAfterMinutes: String(location.bufferAfterMinutes),
              oneWayFee:
                location.oneWayFeeMinor === null ? "" : minorToInput(location.oneWayFeeMinor),
              deliveryEnabled: location.deliveryEnabled ? "on" : "",
              isActive: location.isActive ? "on" : "",
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("hours.title")}</CardTitle>
          <p className="text-sm text-muted">{t("hours.hint")}</p>
        </CardHeader>
        <CardBody>
          <form action={setWeeklyHoursAction} className="flex flex-col gap-4">
            <input type="hidden" name="locationId" value={location.id} />
            <Checkbox
              name="open24h"
              label={t("hours.open24h")}
              description={t("hours.open24hHint")}
              defaultChecked={location.open24h}
            />
            <div className="flex flex-col gap-3">
              {location.weekly.map((day) => {
                const name = weekdayName(day.weekday, "da");
                const always = location.open24h;
                return (
                  <fieldset key={day.weekday} className="flex flex-col gap-2">
                    <legend className="text-sm font-semibold text-ink-900 capitalize">
                      {name}
                    </legend>
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                      <Field label={t("hours.opensAt")}>
                        {(field) => (
                          <Input
                            type="time"
                            name={`opensAt-${day.weekday}`}
                            defaultValue={always ? "" : optional(day.opensAt)}
                            {...field}
                          />
                        )}
                      </Field>
                      <Field label={t("hours.closesAt")}>
                        {(field) => (
                          <Input
                            type="time"
                            name={`closesAt-${day.weekday}`}
                            defaultValue={always ? "" : optional(day.closesAt)}
                            {...field}
                          />
                        )}
                      </Field>
                      <Checkbox
                        name={`closed-${day.weekday}`}
                        label={t("hours.closed")}
                        defaultChecked={!always && day.closed}
                        className="pb-3"
                      />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <Button type="submit" className="self-start">
              {t("hours.save")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("special.title")}</CardTitle>
          <p className="text-sm text-muted">{t("special.hint")}</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {location.specialDays.length === 0 ? (
            <p className="text-muted">{t("special.empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {location.specialDays.map((day) => (
                <li key={day.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">
                      {formatDate(new Date(`${day.specialDate}T12:00:00Z`), "da", "UTC")}
                    </span>{" "}
                    <span className="text-muted">
                      {day.closed ? t("special.closedLabel") : `${day.opensAt}–${day.closesAt}`}
                    </span>
                  </span>
                  <form action={removeSpecialDayAction}>
                    <input type="hidden" name="locationId" value={location.id} />
                    <input type="hidden" name="rowId" value={day.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <Trash2 aria-hidden />
                      {t("special.remove")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form
            action={addSpecialDayAction}
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <input type="hidden" name="locationId" value={location.id} />
            <Field label={t("special.date")} required>
              {(field) => <Input type="date" name="date" {...field} />}
            </Field>
            <Field label={t("special.opensAt")}>
              {(field) => <Input type="time" name="opensAt" {...field} />}
            </Field>
            <Field label={t("special.closesAt")}>
              {(field) => <Input type="time" name="closesAt" {...field} />}
            </Field>
            <Checkbox name="closed" label={t("special.closed")} className="pb-2" />
            <Button type="submit" variant="secondary" className="self-start sm:col-span-4">
              {t("special.add")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("zones.title")}</CardTitle>
          <p className="text-sm text-muted">{t("zones.hint")}</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {!location.deliveryEnabled ? <Alert tone="info">{t("zones.deliveryOff")}</Alert> : null}
          {location.deliveryZones.length === 0 ? (
            <p className="text-muted">{t("zones.empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {location.deliveryZones.map((zone) => (
                <li key={zone.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">
                      {t("zones.upTo", { km: zone.maxDistanceKm })}
                    </span>{" "}
                    <Price amountMinor={zone.feeMinor} currency={zone.currency} />
                  </span>
                  <form action={removeDeliveryZoneAction}>
                    <input type="hidden" name="locationId" value={location.id} />
                    <input type="hidden" name="zoneId" value={zone.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <Trash2 aria-hidden />
                      {t("zones.remove")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={saveDeliveryZoneAction} className="grid items-end gap-3 sm:grid-cols-3">
            <input type="hidden" name="locationId" value={location.id} />
            <Field label={t("zones.maxDistanceKm")} required>
              {(field) => <Input name="maxDistanceKm" inputMode="numeric" {...field} />}
            </Field>
            <Field label={t("zones.fee")} hint={t("zones.feeHint")} required>
              {(field) => <Input name="fee" inputMode="decimal" {...field} />}
            </Field>
            <Button type="submit" variant="secondary" className="self-start sm:self-end">
              {t("zones.add")}
            </Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
