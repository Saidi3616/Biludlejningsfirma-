"use server";

import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { findAccessibleBooking } from "@/server/booking/access";
import { simulatePayment } from "@/server/payments/simulate";

/** Kun lokalt og i CI: gennemfør eller afvis betalingen uden Stripe. */
export async function simulatePaymentAction(formData: FormData) {
  const reference = String(formData.get("reference") ?? "");
  const rawLocale = String(formData.get("locale") ?? "");
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const outcome = formData.get("outcome") === "failed" ? "failed" : "succeeded";
  const bookingId = await findAccessibleBooking(reference);
  if (!bookingId) notFound();

  await simulatePayment(bookingId, outcome);
  redirect(
    localizedPath(
      locale,
      outcome === "succeeded" ? `/booking/confirmation/${reference}` : `/booking/pay/${reference}`,
    ),
  );
}
