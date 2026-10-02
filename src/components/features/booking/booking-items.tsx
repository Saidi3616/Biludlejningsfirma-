import { useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { BookingSummary } from "@/server/booking/summary";

const plainLabels = ["DELIVERY_FEE", "ONE_WAY_FEE", "DISCOUNT", "FEE"] as const;

/** En oprettet bookings bil, periode og prislinjer, som de blev gemt ved bookingen. */
export function BookingItems({ booking, locale }: { booking: BookingSummary; locale: string }) {
  const t = useTranslations();
  const label = (item: BookingSummary["items"][number]) => {
    if (item.type === "RENTAL") return t("booking.rental");
    if (item.type === "EXTRA")
      return item.quantity > 1 ? `${item.label} × ${item.quantity}` : item.label;
    const key = plainLabels.find((candidate) => candidate === item.type);
    return key ? t(`car.lines.${key}`) : item.label;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-base">
        <p className="font-semibold text-ink-900">{booking.car.name}</p>
        <p className="text-ink-700">
          {t("booking.pickup")}: {booking.pickupLocation.name},{" "}
          {formatDateTime(booking.pickupAt, locale, booking.pickupLocation.timezone)}
        </p>
        <p className="text-ink-700">
          {t("booking.return")}: {booking.returnLocation.name},{" "}
          {formatDateTime(booking.returnAt, locale, booking.returnLocation.timezone)}
        </p>
        {booking.deliveryAddress ? (
          <p className="text-ink-700">
            {t("booking.deliveryTo", { address: booking.deliveryAddress })}
          </p>
        ) : null}
      </div>
      <dl className="flex flex-col gap-2 text-base">
        {booking.items.map((item, index) => (
          <div key={`${item.type}-${index}`} className="flex justify-between gap-4">
            <dt className="text-ink-700">{label(item)}</dt>
            <dd className="font-medium text-ink-900">
              <Price amountMinor={item.totalMinor} currency={booking.currency} />
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border pt-3 text-lg font-semibold">
          <dt>{t("car.totalLabel")}</dt>
          <dd>
            <Price amountMinor={booking.totalMinor} currency={booking.currency} />
          </dd>
        </div>
      </dl>
      {booking.depositMinor > 0 ? (
        <p className="rounded-md bg-surface p-3 text-sm text-ink-700">
          {t("booking.depositNote", {
            price: formatMoney(booking.depositMinor, booking.currency, locale),
          })}
        </p>
      ) : null}
    </div>
  );
}
