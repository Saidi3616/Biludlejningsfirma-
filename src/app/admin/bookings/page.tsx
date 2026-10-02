import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { bookingStatuses } from "@/components/ui/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/features/admin/pagination";
import { formatDateTime } from "@/lib/format";
import { bookingFilterSchema, listBookings } from "@/server/admin/bookings";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.bookings" });
  return { title: t("title") };
}

/** Alle bookinger med søgning og filtre i URL'en (kerneopgave 3). */
export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  setRequestLocale("da");
  await requirePermission("booking:read");
  const filter = bookingFilterSchema.parse(await searchParams);
  const [t, tStatus, ctx, locations] = await Promise.all([
    getTranslations("admin.bookings"),
    getTranslations("status.booking"),
    getPolicyContext(),
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const { rows, total, page, pages } = await listBookings(ctx, filter);
  const params = { q: filter.q, status: filter.status, location: filter.location };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>

      <form
        action="/admin/bookings"
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("search")}
          <Input
            name="q"
            type="search"
            defaultValue={filter.q ?? ""}
            placeholder={t("searchHint")}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("status")}
          <Select name="status" defaultValue={filter.status ?? ""}>
            <option value="">{t("allStatuses")}</option>
            {bookingStatuses.map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("location")}
          <Select name="location" defaultValue={filter.location ?? ""}>
            <option value="">{t("allLocations")}</option>
            {locations.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit">
          <Search aria-hidden />
          {t("submit")}
        </Button>
      </form>

      <p className="text-sm text-muted" role="status">
        {t("count", { count: total })}
      </p>

      {rows.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table label={t("title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("columns.reference")}</TH>
              <TH>{t("columns.customer")}</TH>
              <TH>{t("columns.car")}</TH>
              <TH>{t("columns.period")}</TH>
              <TH>{t("columns.status")}</TH>
              <TH className="text-end">{t("columns.total")}</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.reference}>
                <TD>
                  <Link
                    href={`/admin/bookings/${row.reference}`}
                    className="font-medium whitespace-nowrap text-brand-700 underline"
                  >
                    {row.reference}
                  </Link>
                </TD>
                <TD>
                  {row.customer.firstName} {row.customer.lastName}
                </TD>
                <TD>
                  <span className="flex flex-col whitespace-nowrap">
                    {row.carModel.brand} {row.carModel.model}
                    <span className="text-sm text-muted">{row.car.registrationNumber}</span>
                  </span>
                </TD>
                <TD>
                  <span className="flex flex-col whitespace-nowrap">
                    {formatDateTime(row.pickupAt, "da", row.pickupLocation.timezone)}
                    <span className="text-sm text-muted">
                      {formatDateTime(row.returnAt, "da", row.pickupLocation.timezone)} ·{" "}
                      {row.pickupLocation.name}
                    </span>
                  </span>
                </TD>
                <TD>
                  <span className="flex flex-wrap gap-1">
                    <StatusBadge kind="booking" status={row.status} />
                    <StatusBadge kind="payment" status={row.paymentStatus} />
                  </span>
                </TD>
                <TD className="text-end font-medium whitespace-nowrap">
                  <Price amountMinor={row.totalMinor} currency={row.currency} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <Pagination
        page={page}
        pages={pages}
        path="/admin/bookings"
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
