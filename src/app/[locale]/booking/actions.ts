"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { localizedPath } from "@/i18n/paths";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { checkoutDetailsSchema, parseCheckoutQuery } from "@/lib/validation/checkout";
import { parseCarSearch } from "@/lib/validation/search";
import { getCurrentUser } from "@/server/auth/session";
import { createCheckoutBooking } from "@/server/booking/checkout";
import { grantBookingAccess } from "@/server/booking/access";
import { clientIp } from "@/server/rate-limit";

const detailFields = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "deliveryAddress",
  "acceptTerms",
] as const;

/** Fejl, formularen har en tekst til; alt andet vises som "generic". */
const knownErrors = [
  "CAR_NO_LONGER_AVAILABLE",
  "RATE_LIMITED",
  "OUTSIDE_OPENING_HOURS",
  "VALIDATION_FAILED",
  "OUTSIDE_DELIVERY_ZONE",
  "PRICE_UNAVAILABLE",
] as const;

export type CheckoutError = "fields" | "generic" | (typeof knownErrors)[number];

function isKnownError(code: string): code is (typeof knownErrors)[number] {
  return (knownErrors as readonly string[]).includes(code);
}

export type CheckoutState = {
  error?: CheckoutError;
  fields?: string[];
  /** Det udfyldte, så formularen ikke tømmes ved en fejl. */
  values?: Record<string, string>;
};

/** Trin 2 → reservation (15 min) → betalingssiden. */
export async function createBookingAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const params = Object.fromEntries(
    [...formData.entries()].flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  ) as Record<string, string>;
  const values = Object.fromEntries(detailFields.map((name) => [name, params[name] ?? ""]));
  const locale = hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;

  const details = checkoutDetailsSchema.safeParse(params);
  if (!details.success) {
    const fields = [...new Set(details.error.issues.map((issue) => String(issue.path[0])))];
    return { error: "fields", fields, values };
  }

  let reference: string;
  try {
    const user = await getCurrentUser();
    const created = await createCheckoutBooking(
      parseCarSearch(params),
      parseCheckoutQuery(params),
      details.data,
      { locale, userId: user?.userId ?? null, ip: clientIp(await headers()) },
    );
    await grantBookingAccess(created.booking.reference, created.manageToken);
    reference = created.booking.reference;
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      if (error.code === "VALIDATION_FAILED" && error.details?.fields) {
        return { error: "fields", fields: error.details.fields as string[], values };
      }
      return { error: isKnownError(error.code) ? error.code : "generic", values };
    }
    logger.error({ err: error }, "checkout failed");
    return { error: "generic", values };
  }
  redirect(localizedPath(locale, `/booking/pay/${reference}`));
}
