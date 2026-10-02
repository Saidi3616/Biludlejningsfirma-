import { useLocale, useTranslations } from "next-intl";
import { weekdayName } from "@/lib/format";

type Row = {
  weekday: number | null;
  specialDate: Date | null;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

/** Ugens åbningstider (særlige datoer vises ikke her, men respekteres ved booking). */
export function OpeningHours({ rows }: { rows: Row[] }) {
  const t = useTranslations("locations");
  const locale = useLocale();
  const weekly = rows.filter((row) => row.specialDate === null && row.weekday !== null);
  if (weekly.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base">
      {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
        const periods = weekly.filter((row) => row.weekday === weekday);
        const open = periods.filter((row) => !row.closed && row.opensAt && row.closesAt);
        return (
          <div key={weekday} className="contents">
            <dt className="text-ink-700 first-letter:uppercase">{weekdayName(weekday, locale)}</dt>
            <dd className="text-ink-900 tabular-nums" dir="ltr">
              {open.length === 0 || periods.some((row) => row.closed)
                ? t("closed")
                : open.map((row) => `${row.opensAt}–${row.closesAt}`).join(", ")}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
