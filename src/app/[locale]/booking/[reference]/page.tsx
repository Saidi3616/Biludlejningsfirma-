import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Container } from "@/components/ui/layout";
import { BookingDetail } from "@/components/features/booking/booking-detail";
import { findAccessibleBooking } from "@/server/booking/access";
import { bookingCancellationTerms } from "@/server/booking/cancel";
import { bookingSummary } from "@/server/booking/summary";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/booking/[reference]">): Promise<Metadata> {
  const { locale, reference } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "manage" });
  return { title: t("title", { reference }), robots: { index: false } };
}

/**
 * Gæstens "administrér booking" (K7). Adgang via linket i e-mailen (sætter en cookie) eller
 * fra samme browser som bookingen; ejeren med konto kan også se den her.
 */
export default async function ManageBookingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/booking/[reference]">) {
  const { locale, reference } = (await params) as { locale: Locale; reference: string };
  setRequestLocale(locale);
  const bookingId = await findAccessibleBooking(reference);
  if (!bookingId) notFound();
  const [booking, terms, query] = await Promise.all([
    bookingSummary(bookingId),
    bookingCancellationTerms(bookingId),
    searchParams,
  ]);

  return (
    <Container className="flex flex-col gap-8 py-10">
      <BookingDetail
        booking={booking}
        terms={terms}
        locale={locale}
        from="booking"
        cancelled={query.cancelled === "1"}
      />
    </Container>
  );
}
