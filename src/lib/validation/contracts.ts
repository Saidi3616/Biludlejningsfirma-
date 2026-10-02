import { z } from "zod";

/** Største underskrift som data-URL. Et canvas på en telefon fylder typisk 10–40 kB. */
export const MAX_SIGNATURE_CHARS = 400_000;

/**
 * Underskrift af lejekontrakten ved udleveringen (F1). Underskriften kommer fra canvas-feltet som
 * PNG i en data-URL; serveren tjekker bagefter, at det er et rigtigt billede med en streg i.
 */
export const signContractSchema = z.object({
  signerName: z.string().trim().min(2).max(120),
  signature: z
    .string()
    .max(MAX_SIGNATURE_CHARS)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
  accept: z.literal("on"),
});
