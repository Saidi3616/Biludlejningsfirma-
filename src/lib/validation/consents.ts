import { z } from "zod";

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.boolean()])
  .optional()
  .transform((value) => value === "on" || value === "true" || value === true);

/** Kundens valg på /account/privacy. Afkrydsningsfelter mangler i formularen, når de er tomme. */
export const accountConsentSchema = z.object({
  marketing: checkbox,
  whatsapp: checkbox,
});

/** Cookie-banneret sender sit valg og et tilfældigt id (ingen persondata). */
export const cookieConsentSchema = z.object({
  id: z.uuid(),
  analytics: z.boolean(),
  marketing: z.boolean(),
});
