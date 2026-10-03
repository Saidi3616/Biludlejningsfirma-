import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { localTimeKey } from "@/lib/dates";
import { adminDashboard } from "@/server/admin/dashboard";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.dashboard" });
  return { title: t("title") };
}

/** "Hvad skal jeg gøre i dag?" (06-admin-flows.md, F0). */
export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  setRequestLocale("da");
  const user = await requirePermission("booking:read");
  const { location } = await searchParams;
  const locationId = typeof location === "string" && location ? location : null;
  const [t, ctx, locations] = await Promise.all([
    getTranslations("admin"),
    getPolicyContext(),
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const validLocation = locations.some((place) => place.id === locationId) ? locationId : null;
  const data = await adminDashboard(ctx, { locationId: validLocation });

  const counts = [
    { key: "pickups", value: data.counts.pickups },
    { key: "returns", value: data.counts.returns },
    { key: "active", value: data.counts.active },
    { key: "available", value: data.counts.available },
    { key: "inService", value: data.counts.inService },
  ] as const;
  const attention = [
    { key: "unpaid", value: data.attention.unpaid },
    { key: "pendingRefunds", value: data.attention.pendingRefunds },
    { key: "failedNotifications", value: data.attention.failedNotifications },
    { key: "newMessages", value: data.attention.newMessages },
  ] as const;
  const attentionItems = attention.filter((item) => item.value > 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            {t("dashboard.title")}
          </h1>
          <p className="mt-1 text-muted">
            {t("dashboard.role", { role: t(`roles.${user.role}`) })}
          </p>
        </div>
        <form className="flex items-end gap-2" action="/admin">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
            {t("dashboard.location")}
            <Select name="location" defaultValue={validLocation ?? ""} className="min-w-48">
              <option value="">{t("dashboard.allLocations")}</option>
              {locations.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="secondary">
            {t("dashboard.show")}
          </Button>
        </form>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {counts.map((item) => (
          <li key={item.key}>
            <Card>
              <CardBody className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted">{t(`dashboard.counts.${item.key}`)}</span>
                <span className="text-3xl font-semibold text-ink-900">{item.value}</span>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      {attentionItems.length > 0 ? (
        <Alert tone="warning" title={t("dashboard.attentionTitle")}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {attentionItems.map((item) => (
              <li key={item.key}>{t(`dashboard.attention.${item.key}`, { count: item.value })}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <section aria-labelledby="today" className="flex flex-col gap-3">
        <h2 id="today" className="text-lg font-semibold text-ink-900">
          {t("dashboard.todayTitle")}
        </h2>
        {data.timeline.length === 0 ? (
          <EmptyState title={t("dashboard.todayEmpty")} />
        ) : (
          <Table label={t("tableLabel", { name: t("dashboard.todayTitle") })} className="bg-white">
            <THead>
              <TR>
                <TH>{t("dashboard.columns.time")}</TH>
                <TH>{t("dashboard.columns.what")}</TH>
                <TH>{t("dashboard.columns.booking")}</TH>
                <TH>{t("dashboard.columns.customer")}</TH>
                <TH>{t("dashboard.columns.car")}</TH>
                <TH>{t("dashboard.columns.status")}</TH>
              </TR>
            </THead>
            <tbody>
              {data.timeline.map((row) => (
                <TR key={`${row.kind}-${row.reference}`}>
                  <TD className="font-semibold tabular-nums">
                    {localTimeKey(row.at, row.timeZone)}
                  </TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {row.kind === "pickup" ? (
                        <ArrowUpFromLine className="size-4 text-brand-700" aria-hidden />
                      ) : (
                        <ArrowDownToLine className="size-4 text-success-700" aria-hidden />
                      )}
                      {t(`dashboard.kind.${row.kind}`)} · {row.location}
                    </span>
                  </TD>
                  <TD>
                    <Link
                      href={`/admin/bookings/${row.reference}`}
                      className="font-medium text-brand-700 underline"
                    >
                      {row.reference}
                    </Link>
                  </TD>
                  <TD>
                    <span className="flex flex-col">
                      {row.customerName}
                      {row.phone ? (
                        <a href={`tel:${row.phone}`} className="text-sm text-brand-700 underline">
                          {row.phone}
                        </a>
                      ) : null}
                    </span>
                  </TD>
                  <TD>
                    <span className="flex flex-col whitespace-nowrap">
                      {row.carName}
                      <span className="text-sm text-muted">{row.registration}</span>
                    </span>
                  </TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      <StatusBadge kind="booking" status={row.status} />
                      <StatusBadge kind="payment" status={row.paymentStatus} />
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {data.kpi ? (
        <section aria-labelledby="kpi" className="flex flex-col gap-3">
          <h2 id="kpi" className="text-lg font-semibold text-ink-900">
            {t("dashboard.kpiTitle")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            <li>
              <Card>
                <CardBody className="flex flex-col gap-1 p-4">
                  <span className="text-sm text-muted">{t("dashboard.kpi.revenue")}</span>
                  <span className="text-2xl font-semibold text-ink-900">
                    <Price amountMinor={data.kpi.revenueMinor} currency={data.kpi.currency} />
                  </span>
                </CardBody>
              </Card>
            </li>
            <li>
              <Card>
                <CardBody className="flex flex-col gap-1 p-4">
                  <span className="text-sm text-muted">{t("dashboard.kpi.outstanding")}</span>
                  <span className="text-2xl font-semibold text-ink-900">
                    <Price amountMinor={data.kpi.outstandingMinor} currency={data.kpi.currency} />
                  </span>
                </CardBody>
              </Card>
            </li>
            <li>
              <Card>
                <CardBody className="flex flex-col gap-1 p-4">
                  <span className="text-sm text-muted">{t("dashboard.kpi.newCustomers")}</span>
                  <span className="text-2xl font-semibold text-ink-900">
                    {data.kpi.newCustomers}
                  </span>
                </CardBody>
              </Card>
            </li>
          </ul>
        </section>
      ) : null}
    </>
  );
}
