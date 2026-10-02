import { z } from "zod";
import { locales } from "@/i18n/routing";
import { bookingCustomerSchema } from "./booking";
import { normalizePhone } from "./checkout";

/**
 * Et beløb skrevet i kroner ("1.234,50", "1234,5", "1234.50" eller "450") som heltal i øre.
 * Komma er decimaltegn; punktum er tusindtalsseparator, medmindre det er det eneste skilletegn
 * og efterfølges af 1-2 cifre.
 */
export function parseKroner(value: string): number | null {
  const text = value.replace(/\s|kr\.?/gi, "");
  let normalized: string;
  if (text.includes(",")) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) normalized = text.replace(/\./g, "");
  else normalized = text;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

const kroner = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const minor = parseKroner(value);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: "Ugyldigt beløb" });
      return z.NEVER;
    }
    return minor;
  });

const reason = z.string().trim().min(3).max(500);
const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** F6: annullering fra admin. Refusionen foreslås af politikken og kan overstyres. */
export const adminCancelSchema = z.object({ refund: kroner, reason, confirm: z.literal("on") });

/** Refusion uden annullering, fx efter en datoændring til en billigere periode. */
export const adminRefundSchema = z.object({
  amount: kroner.pipe(z.number().int().min(1)),
  reason,
});

export const manualMethods = ["CASH", "CARD", "MOBILEPAY", "BANK_TRANSFER"] as const;

/** Betaling ved skranken eller via bankoverførsel, registreret af personalet. */
export const manualPaymentSchema = z.object({
  amount: kroner.pipe(z.number().int().min(1)),
  method: z.enum(manualMethods),
});

/** F5: ny periode. Tider er lokale for afhentnings- og afleveringsstedet. */
export const rescheduleSchema = z.object({
  pickupDate: date,
  pickupTime: time,
  returnDate: date,
  returnTime: time,
  /** "keep": samme pris. "new": prisen beregnes for den nye periode. */
  price: z.enum(["keep", "new"]).default("keep"),
});

export const reassignSchema = z.object({ carId: z.uuid() });

/** F3: telefon- og skrankebooking. Samme kunderegler som online. */
export const phoneBookingSchema = z.object({
  firstName: bookingCustomerSchema.shape.firstName,
  lastName: bookingCustomerSchema.shape.lastName,
  email: bookingCustomerSchema.shape.email,
  phone: z
    .string()
    .trim()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/)),
  locale: z.enum(locales),
  carModelId: z.uuid(),
  pickupLocationId: z.uuid(),
  returnLocationId: z.uuid(),
  pickupDate: date,
  pickupTime: time,
  returnDate: date,
  returnTime: time,
  extras: z
    .array(z.string().regex(/^[a-z0-9_-]{1,64}$/))
    .max(20)
    .default([]),
  discountCode: z
    .string()
    .trim()
    .max(40)
    .transform((code) => code.toUpperCase() || null),
  /** "link": kunden får et betalingslink (24 timer). "counter": betales ved skranken. */
  payment: z.enum(["link", "counter"]),
});

export type PhoneBookingField = keyof z.input<typeof phoneBookingSchema>;
