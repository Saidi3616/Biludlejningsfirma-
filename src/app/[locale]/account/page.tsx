import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { BookingCard } from "@/components/features/account/booking-card";
import { requireCustomer } from "@/server/auth/session";
import { claimGuestBookings, customerBookings } from "@/server/account/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

/** Min konto: kommende bookinger øverst, derefter tidligere (05-user-flows.md, E6). */
export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireCustomer(
    `${localizedPath(locale, "/login")}?next=${localizedPath(locale, "/account")}`,
  );
  // Bookinger lavet som gæst med samme (verificerede) e-mail hører til kontoen (K7).
  await claimGuestBookings(user);
  const [t, { upcoming, past }] = await Promise.all([
    getTranslations("account"),
    customerBookings(user.userId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="sr-only">{t("bookings.title")}</h1>
      <p className="text-muted">{t("signedInAs", { name: user.name, email: user.email })}</p>

      <section aria-labelledby="upcoming" className="flex flex-col gap-3">
        <h2 id="upcoming" className="text-xl font-semibold text-ink-900">
          {t("bookings.upcoming")}
        </h2>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {upcoming.map((booking) => (
              <li key={booking.reference}>
                <BookingCard booking={booking} locale={locale} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<CalendarX />}
            title={t("bookings.emptyTitle")}
            description={t("bookings.emptyBody")}
            action={
              <Button asChild variant="cta">
                <Link href="/cars">{t("bookings.findCar")}</Link>
              </Button>
            }
          />
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="past" className="flex flex-col gap-3">
          <h2 id="past" className="text-xl font-semibold text-ink-900">
            {t("bookings.past")}
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map((booking) => (
              <li key={booking.reference}>
                <BookingCard booking={booking} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
