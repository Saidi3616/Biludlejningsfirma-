import { z } from "zod";

/** Anmeldelse fra kunden (E8): 1–5 stjerner, valgfri kommentar og et visningsnavn. */
export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => value || null),
  displayName: z.string().trim().min(2).max(40),
});

export type ReviewField = keyof z.input<typeof reviewSchema>;

export const reviewStatusSchema = z.enum(["PENDING", "PUBLISHED", "HIDDEN"]);
