import { z } from "zod";
import { optionalText } from "./fleet";

/**
 * Firmaoplysninger (/admin/settings). WhatsApp gemmes som rene cifre med landekode, fordi
 * wa.me-links kræver det; mellemrum, "+" og bindestreger fjernes, så "+45 12 34 56 78" virker.
 */
export const siteSettingsSchema = z.object({
  phone: z
    .string()
    .trim()
    .pipe(
      z
        .string()
        .min(4)
        .max(30)
        .regex(/^\+?[0-9 ()-]+$/),
    ),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  whatsappNumber: z
    .string()
    .transform((value) => value.replace(/[\s+()-]/g, ""))
    .pipe(z.string().regex(/^[1-9][0-9]{7,14}$/)),
  address: optionalText(200),
});

export type SiteSettingsField = keyof z.input<typeof siteSettingsSchema>;
