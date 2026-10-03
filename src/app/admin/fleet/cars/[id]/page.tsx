import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/choice";
import { EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { CarForm } from "@/components/features/admin/car-form";
import { CarOpStatusBadge } from "@/components/features/admin/car-op-status";
import { CarWarnings } from "@/components/features/admin/car-warnings";
import { CarOpStatus, MaintenanceType } from "@/generated/prisma/enums";
import { addDaysToKey, localDateKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { formatDate, formatDateTime, minorToInput } from "@/lib/format";
import { adminCar, carFormOptions } from "@/server/admin/fleet";
import { carHistory } from "@/server/inspections/service";
import { damageRepairedAction } from "@/app/admin/inspections/actions";
import { can } from "@/server/auth/policies";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import {
  carStatusAction,
  maintenanceAction,
  maintenanceStatusAction,
  odometerAction,
  updateCarAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/admin/fleet/cars/[id]">) {
  const { id } = await params;
  const t = await getTranslations({ locale: "da", namespace: "admin.fleet" });
  try {
    const car = await adminCar(await getPolicyContext(), id);
    return { title: car.registrationNumber };
  } catch {
    return { title: t("title") };
  }
}

const NOTICES = [
  "created",
  "saved",
  "statusChanged",
  "odometerSaved",
  "maintenanceAdded",
  "maintenanceUpdated",
  "damageRepaired",
  "invalid",
  "odometerDown",
  "endBeforeStart",
  "rented",
  "hasBookings",
  "bookingsInPeriod",
  "maintenanceOverlap",
  "conflict",
  "forbidden",
  "notFound",
  "failed",
] as const;
type Notice = (typeof NOTICES)[number];
const SUCCESS: Notice[] = [
  "created",
  "saved",
  "statusChanged",
  "odometerSaved",
  "maintenanceAdded",
  "maintenanceUpdated",
  "damageRepaired",
];

const NEXT_STATUS = {
  PLANNED: ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
} as const;

/** Dato fra databasen (@db.Date, midnat UTC) til et datofelt. */
const dateInput = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

/** Én bil: status, km, kommende bookinger, værksted og stamdata (F4). */
export default async function AdminCarPage({
  params,
  searchParams,
}: PageProps<"/admin/fleet/cars/[id]">) {
  setRequestLocale("da");
  await requirePermission("fleet:read");
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const ctx = await getPolicyContext();
  let car;
  try {
    car = await adminCar(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [t, tStatus, tType, tMaintenance, options, history, tArea, tSeverity, tInspection] =
    await Promise.all([
      getTranslations("admin.fleet"),
      getTranslations("admin.fleet.opStatus"),
      getTranslations("admin.fleet.maintenance.types"),
      getTranslations("admin.fleet.maintenance.statuses"),
      carFormOptions(ctx),
      carHistory(ctx, id),
      getTranslations("admin.damage.areas"),
      getTranslations("admin.damage.severities"),
      getTranslations("admin.inspection.types"),
    ]);
  const tAdmin = await getTranslations("admin");
  const canDamage = can(ctx, "damage:write");
  const canInspect = can(ctx, "inspection:write");
  const zone = car.homeLocation.timezone;
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const refs =
    typeof search.refs === "string"
      ? search.refs.split(",").filter((ref) => /^[A-Z0-9-]{1,40}$/.test(ref))
      : [];
  const canSetStatus = can(ctx, "fleet:setStatus");
  const canWrite = can(ctx, "fleet:write");
  const statuses = Object.values(CarOpStatus).filter(
    (status) => status !== car.opStatus && (status !== "RETIRED" || canWrite),
  );
  const tomorrow = addDaysToKey(localDateKey(new Date(), zone), 1);
  const carId = <input type="hidden" name="carId" value={car.id} />;
  const refLinks = (
    <ul className="flex flex-wrap gap-2">
      {refs.map((reference) => (
        <li key={reference}>
          <Link href={`/admin/bookings/${reference}`} className="text-brand-700 underline">
            {reference}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <Link
        href="/admin/fleet/cars"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {car.registrationNumber}
          </h1>
          <CarOpStatusBadge status={car.opStatus} />
          <CarWarnings warnings={car.warnings} />
        </div>
        <p className="text-muted">
          {car.carModel.brand} {car.carModel.model}
          {car.color ? ` · ${car.color}` : ""} · {car.homeLocation.name} ·{" "}
          {t("km", { km: car.odometerKm })}
        </p>
      </div>

      {notice ? (
        <Alert
          tone={SUCCESS.includes(notice) ? "success" : "danger"}
          title={t(`notices.${notice}`)}
        >
          {refs.length > 0 ? refLinks : null}
        </Alert>
      ) : null}

      <section aria-labelledby="bookings" className="flex flex-col gap-3">
        <h2 id="bookings" className="text-lg font-semibold text-ink-900">
          {t("car.bookings")}
        </h2>
        {car.bookings.length === 0 ? (
          <EmptyState title={t("car.noBookings")} />
        ) : (
          <>
            <p className="text-sm text-muted">{t("car.bookingsHint")}</p>
            <Table label={tAdmin("tableLabel", { name: t("car.bookings") })} className="bg-white">
              <THead>
                <TR>
                  <TH>{t("car.columns.reference")}</TH>
                  <TH>{t("car.columns.customer")}</TH>
                  <TH>{t("car.columns.period")}</TH>
                  <TH>{t("car.columns.status")}</TH>
                </TR>
              </THead>
              <tbody>
                {car.bookings.map((booking) => (
                  <TR key={booking.id}>
                    <TD>
                      <Link
                        href={`/admin/bookings/${booking.reference}`}
                        className="font-medium whitespace-nowrap text-brand-700 underline"
                      >
                        {booking.reference}
                      </Link>
                    </TD>
                    <TD>
                      {booking.customer.firstName} {booking.customer.lastName}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatDateTime(booking.pickupAt, "da", zone)} –{" "}
                      {formatDateTime(booking.returnAt, "da", zone)}
                    </TD>
                    <TD>
                      <StatusBadge kind="booking" status={booking.status} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </section>

      {canSetStatus ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-ink-900">{t("car.statusTitle")}</h2>
              <p className="text-sm text-muted">{t("car.statusIntro")}</p>
              <form action={carStatusAction} className="flex flex-col gap-4">
                {carId}
                <Field label={t("car.newStatus")} required>
                  {(field) => (
                    <Select name="status" {...field}>
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {tStatus(status)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {car.bookings.length > 0 ? (
                  <Checkbox
                    name="confirm"
                    label={t("car.confirm", { count: car.bookings.length })}
                    description={t("car.confirmHint")}
                  />
                ) : null}
                <Button type="submit" variant="secondary" className="self-start">
                  {t("car.setStatus")}
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-ink-900">{t("car.odometerTitle")}</h2>
              <form action={odometerAction} className="flex flex-col gap-4">
                {carId}
                <Field label={t("car.odometer")} hint={t("car.odometerHint")} required>
                  {(field) => (
                    <Input
                      name="odometerKm"
                      inputMode="numeric"
                      defaultValue={String(car.odometerKm)}
                      {...field}
                    />
                  )}
                </Field>
                <Button type="submit" variant="secondary" className="self-start">
                  {t("car.saveOdometer")}
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <section aria-labelledby="maintenance" className="flex flex-col gap-3">
        <h2 id="maintenance" className="text-lg font-semibold text-ink-900">
          {t("maintenance.title")}
        </h2>
        {car.maintenance.length === 0 ? (
          <EmptyState title={t("maintenance.empty")} />
        ) : (
          <Table
            label={tAdmin("tableLabel", { name: t("maintenance.title") })}
            className="bg-white"
          >
            <THead>
              <TR>
                <TH>{t("maintenance.columns.type")}</TH>
                <TH>{t("maintenance.columns.period")}</TH>
                <TH>{t("maintenance.columns.vendor")}</TH>
                <TH className="text-end">{t("maintenance.columns.cost")}</TH>
                <TH>{t("maintenance.columns.status")}</TH>
                {canSetStatus ? <TH>{t("maintenance.columns.action")}</TH> : null}
              </TR>
            </THead>
            <tbody>
              {car.maintenance.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <span className="flex flex-col">
                      {tType(item.type)}
                      {item.notes ? <span className="text-sm text-muted">{item.notes}</span> : null}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {formatDateTime(item.startsAt, "da", zone)} –{" "}
                    {formatDateTime(item.endsAt, "da", zone)}
                  </TD>
                  <TD>{item.vendor ?? "–"}</TD>
                  <TD className="text-end whitespace-nowrap">
                    {item.costMinor !== null ? (
                      <Price amountMinor={item.costMinor} currency="DKK" />
                    ) : (
                      "–"
                    )}
                  </TD>
                  <TD>{tMaintenance(item.status)}</TD>
                  {canSetStatus ? (
                    <TD>
                      <span className="flex flex-wrap gap-2">
                        {NEXT_STATUS[item.status].map((status) => (
                          <form key={status} action={maintenanceStatusAction}>
                            {carId}
                            <input type="hidden" name="maintenanceId" value={item.id} />
                            <input type="hidden" name="status" value={status} />
                            <Button
                              type="submit"
                              size="sm"
                              variant={status === "CANCELLED" ? "ghost" : "secondary"}
                            >
                              {t(`maintenance.to.${status}`)}
                            </Button>
                          </form>
                        ))}
                      </span>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}

        {canSetStatus ? (
          <Card>
            <CardBody className="flex flex-col gap-4">
              <h3 className="font-semibold text-ink-900">{t("maintenance.add")}</h3>
              <p className="text-sm text-muted">{t("maintenance.addIntro")}</p>
              <form action={maintenanceAction} className="flex flex-col gap-4">
                {carId}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("maintenance.type")} required>
                    {(field) => (
                      <Select name="type" defaultValue="SERVICE" {...field}>
                        {Object.values(MaintenanceType).map((type) => (
                          <option key={type} value={type}>
                            {tType(type)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t("maintenance.vendor")}>
                    {(field) => <Input name="vendor" {...field} />}
                  </Field>
                  <Field label={t("maintenance.startDate")} required>
                    {(field) => (
                      <Input type="date" name="startDate" defaultValue={tomorrow} {...field} />
                    )}
                  </Field>
                  <Field label={t("maintenance.startTime")} required>
                    {(field) => (
                      <Input
                        type="time"
                        step={900}
                        name="startTime"
                        defaultValue="08:00"
                        {...field}
                      />
                    )}
                  </Field>
                  <Field label={t("maintenance.endDate")} required>
                    {(field) => (
                      <Input type="date" name="endDate" defaultValue={tomorrow} {...field} />
                    )}
                  </Field>
                  <Field label={t("maintenance.endTime")} required>
                    {(field) => (
                      <Input
                        type="time"
                        step={900}
                        name="endTime"
                        defaultValue="16:00"
                        {...field}
                      />
                    )}
                  </Field>
                  <Field label={t("maintenance.cost")} hint={t("amountHint")}>
                    {(field) => <Input name="cost" inputMode="decimal" {...field} />}
                  </Field>
                </div>
                <Field label={t("maintenance.notes")}>
                  {(field) => <Textarea name="notes" rows={2} {...field} />}
                </Field>
                <Button type="submit" variant="secondary" className="self-start">
                  {t("maintenance.submit")}
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="damages" className="flex flex-col gap-3">
        <h2 id="damages" className="text-lg font-semibold text-ink-900">
          {t("car.damages")}
        </h2>
        {history.damages.length === 0 ? (
          <EmptyState title={t("car.noDamages")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {history.damages.map((damage) => (
              <li
                key={damage.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-white p-3"
              >
                <Badge tone={damage.repairedAt ? "success" : "warning"}>
                  {tArea(damage.area as "front")}
                </Badge>
                <Badge>{tSeverity(damage.severity)}</Badge>
                <span className="min-w-0 flex-1 text-ink-900">
                  {damage.description}
                  <span className="block text-sm text-muted">
                    {formatDate(damage.createdAt, "da", zone)}
                    {damage.booking ? ` · ${damage.booking.reference}` : ""}
                    {damage.repairedAt
                      ? ` · ${t("car.repairedOn", { date: formatDate(damage.repairedAt, "da", zone) })}`
                      : ""}
                  </span>
                </span>
                {canDamage && damage.repairedAt === null ? (
                  <form action={damageRepairedAction}>
                    <input type="hidden" name="damageId" value={damage.id} />
                    <input type="hidden" name="returnTo" value={`/admin/fleet/cars/${car.id}`} />
                    <Button type="submit" size="sm" variant="secondary">
                      {t("car.markRepaired")}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.inspections.length > 0 ? (
        <section aria-labelledby="inspections" className="flex flex-col gap-3">
          <h2 id="inspections" className="text-lg font-semibold text-ink-900">
            {t("car.inspections")}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {history.inspections.map((inspection) => (
              <li key={inspection.id}>
                {canInspect ? (
                  <Link
                    href={`/admin/inspections/${inspection.id}`}
                    className="font-medium text-brand-700 underline"
                  >
                    {tInspection(inspection.type)}
                  </Link>
                ) : (
                  <span className="font-medium">{tInspection(inspection.type)}</span>
                )}{" "}
                · {formatDateTime(inspection.performedAt, "da", zone)} ·{" "}
                {t("km", { km: inspection.odometerKm })}
                {inspection.booking ? ` · ${inspection.booking.reference}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="details" className="flex flex-col gap-3">
        <h2 id="details" className="text-lg font-semibold text-ink-900">
          {t("car.details")}
        </h2>
        {canWrite ? (
          <Card>
            <CardBody>
              <CarForm
                action={updateCarAction}
                options={options}
                carId={car.id}
                showPurchasePrice={can(ctx, "car:readPurchasePrice")}
                defaults={{
                  carModelId: car.carModel.id,
                  homeLocationId: car.homeLocation.id,
                  registrationNumber: car.registrationNumber,
                  vin: car.vin,
                  color: car.color ?? "",
                  odometerKm: String(car.odometerKm),
                  purchaseDate: dateInput(car.purchaseDate),
                  purchasePrice:
                    car.purchasePriceMinor !== null ? minorToInput(car.purchasePriceMinor) : "",
                  insurancePolicy: car.insurancePolicy ?? "",
                  insuranceExpiresAt: dateInput(car.insuranceExpiresAt),
                  nextInspectionDue: dateInput(car.nextInspectionDue),
                  nextServiceDue: dateInput(car.nextServiceDue),
                  nextServiceKm: car.nextServiceKm !== null ? String(car.nextServiceKm) : "",
                  tyreType: car.tyreType ?? "",
                }}
              />
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {(
                  [
                    ["vin", car.vin],
                    ["tyreType", car.tyreType],
                    ["nextInspectionDue", car.nextInspectionDue],
                    ["nextServiceDue", car.nextServiceDue],
                    [
                      "nextServiceKm",
                      car.nextServiceKm !== null ? t("km", { km: car.nextServiceKm }) : null,
                    ],
                    ["insurancePolicy", car.insurancePolicy],
                    ["insuranceExpiresAt", car.insuranceExpiresAt],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted">{t(`form.${key}`)}</dt>
                    <dd className="text-ink-900">
                      {value instanceof Date ? formatDate(value, "da", "UTC") : (value ?? "–")}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        )}
      </section>
    </>
  );
}
