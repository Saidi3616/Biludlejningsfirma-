"use server";

import { redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { cancelSchema } from "@/lib/validation/account";
import { getCurrentUser } from "@/server/auth/session";
import { findAccessibleBooking } from "@/server/booking/access";
import { cancelBooking } from "@/server/booking/cancel";

export type CancelState = { error?: "confirm" | "notAllowed" | "generic" };

/** Kunden (eller gæsten med linket) annullerer. Refusionen følger annulleringspolitikken. */
export async function cancelBookingAction(
  _previous: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const reference = String(formData.get("reference") ?? "");
  const rawLocale = String(formData.get("locale") ?? "");
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  const base = formData.get("from") === "account" ? "/account/bookings" : "/booking";

  const bookingId = await findAccessibleBooking(reference);
  if (!bookingId) return { error: "notAllowed" };
  if (!cancelSchema.safeParse({ confirm: formData.get("confirm") }).success) {
    return { error: "confirm" };
  }

  try {
    const user = await getCurrentUser();
    await cancelBooking(bookingId, { actorUserId: user?.userId ?? null });
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") return { error: "notAllowed" };
    logger.error({ err: error, bookingId }, "cancellation failed");
    return { error: "generic" };
  }
  redirect(`${localizedPath(locale, `${base}/${reference}`)}?cancelled=1`);
}
