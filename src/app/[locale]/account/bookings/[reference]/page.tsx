import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { BookingDetail } from "@/components/features/booking/booking-detail";
import { requireCustomer } from "@/server/auth/session";
import { findAccessibleBooking } from "@/server/booking/access";
import { bookingCancellationTerms } from "@/server/booking/cancel";
import { bookingSummary } from "@/server/booking/summary";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account/bookings/[reference]">): Promise<Metadata> {
  const { locale, reference } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "manage" });
  return { title: t("title", { reference }), robots: { index: false } };
}

export default async function AccountBookingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/account/bookings/[reference]">) {
  const { locale, reference } = (await params) as { locale: Locale; reference: string };
  setRequestLocale(locale);
  const path = localizedPath(locale, `/account/bookings/${reference}`);
  await requireCustomer(`${localizedPath(locale, "/login")}?next=${path}`);
  const bookingId = await findAccessibleBooking(reference);
  if (!bookingId) notFound();
  const [t, booking, terms, query] = await Promise.all([
    getTranslations("account.bookings"),
    bookingSummary(bookingId),
    bookingCancellationTerms(bookingId),
    searchParams,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/account"
        className="inline-flex items-center gap-2 self-start text-base font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <BookingDetail
        booking={booking}
        terms={terms}
        locale={locale}
        from="account"
        cancelled={query.cancelled === "1"}
      />
    </div>
  );
}
