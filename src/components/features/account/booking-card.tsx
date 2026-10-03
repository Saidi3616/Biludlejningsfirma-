import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Price } from "@/components/ui/price";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/format";
import type { AccountBooking } from "@/server/account/service";

/** En booking i listen på Min konto. Hele kortet er et link til detaljerne. */
export function BookingCard({ booking, locale }: { booking: AccountBooking; locale: string }) {
  const t = useTranslations("account.bookings");
  const zone = booking.location.timezone;
  return (
    <Link
      href={`/account/bookings/${booking.reference}`}
      className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 hover:bg-ink-50 sm:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-ink-900">{booking.carName}</span>
          <StatusBadge kind="booking" status={booking.status} />
        </div>
        <span className="text-base text-ink-700">
          {formatDateTime(booking.pickupAt, locale, zone)} –{" "}
          {formatDateTime(booking.returnAt, locale, zone)}
        </span>
        <span className="text-sm text-muted">
          {t("meta", { reference: booking.reference, location: booking.location.name })}
        </span>
      </div>
      <span className="font-semibold text-ink-900">
        <Price amountMinor={booking.totalMinor} currency={booking.currency} />
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-400 rtl:rotate-180" aria-hidden />
    </Link>
  );
}
