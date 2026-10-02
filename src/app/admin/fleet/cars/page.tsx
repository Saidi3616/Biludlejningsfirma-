import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { CarOpStatusBadge } from "@/components/features/admin/car-op-status";
import { CarWarnings } from "@/components/features/admin/car-warnings";
import { FleetTabs } from "@/components/features/admin/fleet-tabs";
import { Pagination } from "@/components/features/admin/pagination";
import { CarOpStatus } from "@/generated/prisma/enums";
import { carFilterSchema, carFormOptions, listCars } from "@/server/admin/fleet";
import { can } from "@/server/auth/policies";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.fleet" });
  return { title: t("title") };
}

/** Flåden: alle biler med status, km og frister (F4, 04-sitemap). */
export default async function AdminCarsPage({ searchParams }: PageProps<"/admin/fleet/cars">) {
  setRequestLocale("da");
  await requirePermission("fleet:read");
  const filter = carFilterSchema.parse(await searchParams);
  const [t, tStatus, ctx] = await Promise.all([
    getTranslations("admin.fleet"),
    getTranslations("admin.fleet.opStatus"),
    getPolicyContext(),
  ]);
  const [{ rows, total, page, pages }, options] = await Promise.all([
    listCars(ctx, filter),
    carFormOptions(ctx),
  ]);
  const params = {
    q: filter.q,
    status: filter.status,
    location: filter.location,
    model: filter.model,
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        {can(ctx, "fleet:write") ? (
          <Button asChild>
            <Link href="/admin/fleet/cars/new">
              <Plus aria-hidden />
              {t("cars.new")}
            </Link>
          </Button>
        ) : null}
      </div>
      <FleetTabs current="cars" />

      <form
        action="/admin/fleet/cars"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("cars.search")}
          <Input
            name="q"
            type="search"
            defaultValue={filter.q ?? ""}
            placeholder={t("cars.searchHint")}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("cars.status")}
          <Select name="status" defaultValue={filter.status ?? ""}>
            <option value="">{t("cars.allStatuses")}</option>
            {Object.values(CarOpStatus).map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("cars.model")}
          <Select name="model" defaultValue={filter.model ?? ""}>
            <option value="">{t("cars.allModels")}</option>
            {options.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("cars.location")}
          <Select name="location" defaultValue={filter.location ?? ""}>
            <option value="">{t("cars.allLocations")}</option>
            {options.locations.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit">
          <Search aria-hidden />
          {t("cars.submit")}
        </Button>
      </form>

      <p className="text-sm text-muted" role="status">
        {t("cars.count", { count: total })}
      </p>

      {rows.length === 0 ? (
        <EmptyState title={t("cars.empty")} />
      ) : (
        <Table label={t("title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("cars.columns.registration")}</TH>
              <TH>{t("cars.columns.model")}</TH>
              <TH>{t("cars.columns.location")}</TH>
              <TH className="text-end">{t("cars.columns.odometer")}</TH>
              <TH>{t("cars.columns.status")}</TH>
              <TH>{t("cars.columns.warnings")}</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Link
                    href={`/admin/fleet/cars/${row.id}`}
                    className="font-medium whitespace-nowrap text-brand-700 underline"
                  >
                    {row.registrationNumber}
                  </Link>
                </TD>
                <TD>
                  <span className="flex flex-col whitespace-nowrap">
                    {row.carModel.brand} {row.carModel.model}
                    {row.color ? <span className="text-sm text-muted">{row.color}</span> : null}
                  </span>
                </TD>
                <TD>{row.homeLocation.name}</TD>
                <TD className="text-end whitespace-nowrap">{t("km", { km: row.odometerKm })}</TD>
                <TD>
                  <CarOpStatusBadge status={row.opStatus} />
                </TD>
                <TD>
                  <CarWarnings warnings={row.warnings} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <Pagination
        page={page}
        pages={pages}
        path="/admin/fleet/cars"
        params={params}
        labels={{
          previous: t("previous"),
          next: t("next"),
          status: t("page", { page, pages }),
        }}
      />
    </>
  );
}
