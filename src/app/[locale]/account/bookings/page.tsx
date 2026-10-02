import { redirect } from "next/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";

/** Bookingerne står på forsiden af Min konto. */
export default async function AccountBookingsPage({
  params,
}: PageProps<"/[locale]/account/bookings">) {
  const { locale } = (await params) as { locale: Locale };
  redirect(localizedPath(locale, "/account"));
}
