import { z } from "zod";
import { DamageLiability, DamageSeverity } from "@/generated/prisma/enums";
import { parseKroner } from "./admin";

/** Områder på bilen. Faste værdier, så skader før og efter kan sammenlignes pr. område. */
export const damageAreas = [
  "front",
  "front-left",
  "front-right",
  "left",
  "right",
  "rear",
  "rear-left",
  "rear-right",
  "roof",
  "windscreen",
  "wheels",
  "interior",
  "other",
] as const;

/** Brændstof eller batteri i ottendedele, som på bilens måler. */
export const FUEL_EIGHTHS = 8;

const odometer = z.coerce.number().int().min(0).max(2_000_000);
const fuelLevel = z.coerce.number().int().min(0).max(FUEL_EIGHTHS);
const notes = z
  .string()
  .trim()
  .max(1000)
  .transform((value) => value || null);

export const pickupSchema = z.object({ odometerKm: odometer, fuelLevel, notes });

/** Efter aflevering: bilen kan lejes ud igen, skal tjekkes eller på værksted. */
export const returnSchema = z.object({
  odometerKm: odometer,
  fuelLevel,
  notes,
  carStatus: z.enum(["ACTIVE", "INSPECTION", "MAINTENANCE"]),
});

export const damageSchema = z.object({
  area: z.enum(damageAreas),
  severity: z.enum(DamageSeverity),
  description: z.string().trim().min(3).max(1000),
  // Feltet vises kun ved aflevering; et tomt felt betyder "ikke afklaret".
  liability: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(DamageLiability).default("UNDECIDED"),
  ),
  estimatedCost: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const minor = parseKroner(value);
      if (minor === null) {
        ctx.addIssue({ code: "custom", message: "Ugyldigt beløb" });
        return z.NEVER;
      }
      return minor;
    }),
});
