import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { addDaysToKey, localDateKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { statistics, type Statistics } from "@/server/admin/stats";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.statistics" });
  return { title: t("title") };
}

/** Faste perioder; "to" er altid i dag (inklusive). */
function presets(today: string) {
  return {
    last30: { from: addDaysToKey(today, -29), to: today },
    month: { from: `${today.slice(0, 7)}-01`, to: today },
    year: { from: `${today.slice(0, 4)}-01-01`, to: today },
  };
}

function percent(value: number) {
  return new Intl.NumberFormat("da-DK", { style: "percent", maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Statistik med periodefilter (04-sitemap, M14). */
export default async function StatisticsPage({ searchParams }: PageProps<"/admin/statistics">) {
  setRequestLocale("da");
  await requirePermission("stats:read");
  const search = await searchParams;
  const today = localDateKey(new Date(), ADMIN_TIME_ZONE);
  const periods = presets(today);
  const input = {
    from: typeof search.from === "string" ? search.from : periods.last30.from,
    to: typeof search.to === "string" ? search.to : periods.last30.to,
    location: typeof search.location === "string" ? search.location : "",
  };
  const [t, ctx, locations] = await Promise.all([
    getTranslations("admin.statistics"),
    getPolicyContext(),
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  let data: Statistics;
  let invalid = false;
  try {
    data = await statistics(ctx, input);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "VALIDATION_FAILED") throw error;
    invalid = true;
    data = await statistics(ctx, { ...periods.last30, location: "" });
  }
  const { query } = data;
  const location = query.location ?? "";

  const cards = [
    {
      key: "revenue",
      value: <Price amountMinor={data.revenueMinor} currency={data.currency} />,
      hint: data.refundsMinor
        ? t("hints.refunds", {
            amount: new Intl.NumberFormat("da-DK", {
              style: "currency",
              currency: data.currency,
            }).format(data.refundsMinor / 100),
          })
        : null,
    },
    { key: "bookings", value: data.bookings, hint: null },
    {
      key: "averageValue",
      value: <Price amountMinor={data.averageValueMinor} currency={data.currency} />,
      hint: null,
    },
    {
      key: "occupancy",
      value: percent(data.occupancy),
      hint: t("hints.cars", { count: data.cars }),
    },
    {
      key: "cancellations",
      value: data.cancelled,
      hint: t("hints.cancellations", {
        rate: percent(data.cancellationRate),
        noShows: data.noShows,
      }),
    },
    {
      key: "repeatCustomers",
      value: data.repeatCustomers,
      hint: t("hints.repeatCustomers", { count: data.customers }),
    },
  ] as const;

  const presetLinks = Object.entries(periods).map(([key, period]) => {
    const params = new URLSearchParams({ ...period, ...(location ? { location } : {}) });
    const active = period.from === query.from && period.to === query.to;
    return { key: key as keyof typeof periods, href: `/admin/statistics?${params}`, active };
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      {invalid ? <Alert tone="danger">{t("invalidPeriod")}</Alert> : null}

      <form action="/admin/statistics" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("from")}
          <Input type="date" name="from" defaultValue={query.from} max={today} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("to")}
          <Input type="date" name="to" defaultValue={query.to} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
          {t("location")}
          <Select name="location" defaultValue={location} className="min-w-48">
            <option value="">{t("allLocations")}</option>
            {locations.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          {t("show")}
        </Button>
      </form>
      <nav aria-label={t("presets.label")} className="flex flex-wrap gap-2">
        {presetLinks.map((preset) => (
          <Link
            key={preset.key}
            href={preset.href}
            aria-current={preset.active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              preset.active
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-border bg-white text-ink-900 hover:border-brand-700",
            )}
          >
            {t(`presets.${preset.key}`)}
          </Link>
        ))}
      </nav>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.key}>
            <Card className="h-full">
              <CardBody className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted">{t(`cards.${card.key}`)}</span>
                <span className="text-2xl font-semibold text-ink-900 sm:text-3xl">
                  {card.value}
                </span>
                {card.hint ? <span className="text-sm text-muted">{card.hint}</span> : null}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      {(["popularModels", "popularCategories"] as const).map((key) => (
        <section key={key} aria-labelledby={key} className="flex flex-col gap-3">
          <h2 id={key} className="text-lg font-semibold text-ink-900">
            {t(`${key}.title`)}
          </h2>
          {data[key].length === 0 ? (
            <EmptyState title={t("empty")} />
          ) : (
            <Table label={t(`${key}.title`)} className="bg-white">
              <THead>
                <TR>
                  <TH>{t(`${key}.name`)}</TH>
                  <TH className="text-end">{t("columns.bookings")}</TH>
                  <TH className="text-end">{t("columns.value")}</TH>
                </TR>
              </THead>
              <tbody>
                {data[key].map((row) => (
                  <TR key={row.id}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="text-end tabular-nums">{row.bookings}</TD>
                    <TD className="text-end">
                      <Price amountMinor={row.valueMinor} currency={data.currency} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      ))}
      <p className="text-sm text-muted">{t("footnote")}</p>
    </>
  );
}
