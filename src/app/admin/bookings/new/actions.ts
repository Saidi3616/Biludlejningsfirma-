"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createPhoneBooking } from "@/server/admin/phone-booking";
import { getPolicyContext } from "@/server/auth/session";

const FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "locale",
  "carModelId",
  "pickupLocationId",
  "returnLocationId",
  "pickupDate",
  "pickupTime",
  "returnDate",
  "returnTime",
  "discountCode",
  "payment",
] as const;

export type PhoneBookingState = {
  /** Fejlkode til en samlet besked; felter med fejl står i `fields`. */
  error?: "invalid" | "tooSoon" | "closed" | "carTaken" | "discount" | "price" | "failed";
  fields?: string[];
  values?: Partial<Record<(typeof FIELDS)[number], string>> & { extras?: string[] };
};

export async function createPhoneBookingAction(
  _previous: PhoneBookingState,
  formData: FormData,
): Promise<PhoneBookingState> {
  const values = Object.fromEntries(
    FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof FIELDS)[number], string>;
  const extras = formData.getAll("extras").map(String);
  let created: { reference: string; payment: "link" | "counter" };
  try {
    created = await createPhoneBooking(await getPolicyContext(), { ...values, extras });
  } catch (error) {
    const state = { values: { ...values, extras } };
    if (error instanceof AppError) {
      if (error.code === "VALIDATION_FAILED") {
        const fields = (error.details?.fields as string[] | undefined) ?? [];
        if (error.details?.reason === "TOO_SOON") return { ...state, error: "tooSoon" };
        return { ...state, error: "invalid", fields };
      }
      if (error.code === "OUTSIDE_OPENING_HOURS") return { ...state, error: "closed" };
      if (error.code === "CAR_NO_LONGER_AVAILABLE") return { ...state, error: "carTaken" };
      if (error.code === "DISCOUNT_INVALID")
        return { ...state, error: "discount", fields: ["discountCode"] };
      if (error.code === "PRICE_UNAVAILABLE") return { ...state, error: "price" };
    }
    logger.error({ err: error }, "phone booking failed");
    return { ...state, error: "failed" };
  }
  redirect(
    `/admin/bookings/${created.reference}?notice=${created.payment === "link" ? "linkSent" : "created"}`,
  );
}
