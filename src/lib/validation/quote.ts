import { z } from "zod";

/** Input til en prisberegning. Deles af API, checkout og formularer. */
export const quoteRequestSchema = z.object({
  carModelId: z.uuid(),
  pickupLocationId: z.uuid(),
  returnLocationId: z.uuid(),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
  extras: z
    .array(
      z.object({
        code: z.string().min(1).max(64),
        quantity: z.number().int().min(0).max(10),
      }),
    )
    .max(20)
    .default([]),
  /** Afstand fra afhentningsstedet til kundens adresse; sat når bilen skal leveres. */
  delivery: z.object({ distanceKm: z.number().min(0).max(1000) }).nullish(),
  discountCode: z
    .string()
    .trim()
    .max(40)
    .transform((code) => code.toUpperCase())
    .nullish(),
});

export type QuoteRequest = z.input<typeof quoteRequestSchema>;
