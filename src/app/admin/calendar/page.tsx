import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { statusTone } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { formatDate, weekdayName } from "@/lib/format";
import { adminCalendar, calendarFilterSchema } from "@/server/admin/calendar";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.calendar" });
  return { title: t("title") };
}

/** Farve pr. bookingstatus, samme toner som badges. */
const toneClass = {
  neutral: "bg-ink-100 text-ink-800 border-ink-300",
  brand: "bg-brand-50 text-brand-800 border-brand-300",
  success: "bg-success-50 text-success-700 border-success-700",
  warning: "bg-warning-50 text-warning-700 border-warning-700",
  danger: "bg-danger-50 text-danger-700 border-danger-600",
  info: "bg-info-50 text-info-700 border-info-700",
} as const;

/** Tidslinje pr. bil (06-admin-flows.md, F7). Rækker = biler, blokke = bookinger og service. */
export default async function AdminCalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  setRequestLocale("da");
  await requirePermission("booking:read");
  const filter = calendarFilterSchema.parse(await searchParams);
  const [t, tStatus, ctx] = await Promise.all([
    getTranslations("admin.calendar"),
    getTranslations("status.booking"),
    getPolicyContext(),
  ]);
  const data = await adminCalendar(ctx, filter);
  const span = data.until.getTime() - data.from.getTime();
  const position = (start: Date, end: Date) => {
    const left = Math.max(0, (start.getTime() - data.from.getTime()) / span) * 100;
    const right = Math.min(1, (end.getTime() - data.from.getTime()) / span) * 100;
    return { insetInlineStart: `${left}%`, width: `${Math.max(right - left, 1)}%` };
  };
  const query = (start: string) => {
    const params = new URLSearchParams({ start, days: String(data.days) });
    if (filter.location) params.set("location", filter.location);
    return `/admin/calendar?${params}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        <form action="/admin/calendar" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="start" value={data.startKey} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
            {t("location")}
            <Select name="location" defaultValue={filter.location ?? ""}>
              <option value="">{t("allLocations")}</option>
              {data.locations.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-900">
            {t("range")}
            <Select name="days" defaultValue={String(data.days)}>
              <option value="7">{t("week")}</option>
              <option value="14">{t("twoWeeks")}</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary">
            {t("show")}
          </Button>
        </form>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={query(data.previousStart)}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t("previous")}
        </Link>
        <p className="text-sm font-medium text-ink-900">
          {t("period", {
            from: formatDate(data.from, "da", ADMIN_TIME_ZONE),
            to: formatDate(new Date(data.until.getTime() - 1), "da", ADMIN_TIME_ZONE),
          })}
        </p>
        <Link
          href={query(data.nextStart)}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          {t("next")}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div
        role="region"
        aria-label={t("title")}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-white"
      >
        <div className="min-w-[56rem]">
          <div className="grid grid-cols-[12rem_1fr] border-b border-border bg-ink-50 text-sm font-semibold text-ink-700">
            <div className="px-3 py-2">{t("car")}</div>
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${data.days}, minmax(0, 1fr))` }}
            >
              {data.dayKeys.map((key) => {
                const date = new Date(`${key}T12:00:00Z`);
                const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
                return (
                  <div key={key} className="border-s border-border px-2 py-2">
                    {weekdayName(weekday, "da").slice(0, 3)} {Number(key.slice(8))}/
                    {Number(key.slice(5, 7))}
                  </div>
                );
              })}
            </div>
          </div>
          {data.cars.length === 0 ? (
            <p className="p-4 text-muted">{t("empty")}</p>
          ) : (
            <ul>
              {data.cars.map((car) => (
                <li
                  key={car.id}
                  className="grid grid-cols-[12rem_1fr] border-b border-border last:border-0"
                >
                  <div className="flex flex-col px-3 py-2 text-sm">
                    <span className="font-medium text-ink-900">
                      {car.carModel.brand} {car.carModel.model}
                    </span>
                    <span className="text-muted">
                      {car.registrationNumber} · {car.homeLocation.name}
                    </span>
                  </div>
                  <div className="relative min-h-14">
                    <div
                      className="absolute inset-0 grid"
                      style={{ gridTemplateColumns: `repeat(${data.days}, minmax(0, 1fr))` }}
                      aria-hidden
                    >
                      {data.dayKeys.map((key) => (
                        <div key={key} className="border-s border-border" />
                      ))}
                    </div>
                    <ul>
                      {car.bookings.map((booking) => (
                        <li key={booking.reference}>
                          <Link
                            href={`/admin/bookings/${booking.reference}`}
                            style={position(booking.pickupAt, booking.returnAt)}
                            className={cn(
                              "absolute top-2 bottom-2 flex items-center overflow-hidden rounded-md border px-2 text-xs font-medium whitespace-nowrap hover:brightness-95",
                              toneClass[statusTone.booking[booking.status]],
                            )}
                            title={`${booking.reference} · ${booking.customer.firstName} ${booking.customer.lastName} · ${tStatus(booking.status)}`}
                          >
                            {booking.reference} · {booking.customer.firstName}{" "}
                            {booking.customer.lastName}
                            <span className="sr-only"> · {tStatus(booking.status)}</span>
                          </Link>
                        </li>
                      ))}
                      {car.maintenance.map((item) => (
                        <li
                          key={item.id}
                          style={position(item.startsAt, item.endsAt)}
                          className="absolute top-2 bottom-2 flex items-center gap-1 overflow-hidden rounded-md border border-dashed border-ink-400 bg-ink-50 px-2 text-xs text-ink-700"
                        >
                          <Wrench className="size-3 shrink-0" aria-hidden />
                          {t(`maintenance.${item.type}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-sm text-muted">{t("legend")}</p>
    </>
  );
}
