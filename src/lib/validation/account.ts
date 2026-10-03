import { z } from "zod";
import { routing } from "@/i18n/routing";
import { bookingCustomerSchema } from "./booking";
import { normalizePhone } from "./checkout";

/** Profilen i /account/profile. Telefon er valgfri; tom betyder "ingen". */
export const profileSchema = z.object({
  firstName: bookingCustomerSchema.shape.firstName,
  lastName: bookingCustomerSchema.shape.lastName,
  phone: z
    .string()
    .trim()
    .transform((value) => (value ? normalizePhone(value) : null))
    .pipe(
      z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/)
        .nullable(),
    ),
  locale: z.enum(routing.locales),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileField = keyof ProfileInput;

/** Kunden skal sætte flueben for at annullere (ingen annullering ved et uheld). */
export const cancelSchema = z.object({ confirm: z.literal("on") });
