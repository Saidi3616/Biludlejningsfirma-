import { z } from "zod";
import { locales } from "@/i18n/routing";
import { quoteRequestSchema } from "./quote";

/** Kundens kontaktoplysninger ved booking. Kørekort m.m. indsamles senere (M11/M15). */
export const bookingCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  /** Internationalt format, fx +4512345678. */
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/)
    .nullish(),
});

/** Input til `POST /bookings`: prisforespørgslen plus kunde og levering. */
export const createBookingSchema = quoteRequestSchema
  .extend({
    customer: bookingCustomerSchema,
    deliveryAddress: z.string().trim().min(5).max(300).nullish(),
    locale: z.enum(locales).default("da"),
    /** Idempotency-Key-headeren: samme nøgle giver samme booking. */
    idempotencyKey: z.string().trim().min(8).max(100).nullish(),
  })
  .refine((input) => !input.delivery || Boolean(input.deliveryAddress), {
    path: ["deliveryAddress"],
    message: "Leveringsadresse mangler",
  });

export type CreateBookingRequest = z.input<typeof createBookingSchema>;
