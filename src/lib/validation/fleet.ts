import { z } from "zod";
import { CarOpStatus, Fuel, MaintenanceType, Transmission } from "@/generated/prisma/enums";
import { parseKroner } from "./admin";

/** Tomt felt → null, ellers værdien trimmet. Formularer sender altid tekst. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const optionalDate = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(z.iso.date().nullable());

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().int().min(min).max(max).nullable());

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

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

const optionalKroner = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const minor = parseKroner(value);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: "Ugyldigt beløb" });
      return z.NEVER;
    }
    return minor;
  });

const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on");

/** En fysisk bil. Nummerplade gemmes med store bogstaver og ét mellemrum mellem grupperne. */
export const carSchema = z.object({
  carModelId: z.uuid(),
  homeLocationId: z.uuid(),
  registrationNumber: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase().replace(/\s+/g, " "))
    .pipe(z.string().regex(/^[A-ZÆØÅ0-9 -]{2,12}$/)),
  vin: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/)),
  color: optionalText(40),
  odometerKm: int(0, 2_000_000),
  purchaseDate: optionalDate,
  purchasePrice: optionalKroner,
  insurancePolicy: optionalText(100),
  insuranceExpiresAt: optionalDate,
  nextInspectionDue: optionalDate,
  nextServiceDue: optionalDate,
  nextServiceKm: optionalInt(0, 2_000_000),
  tyreType: optionalText(40),
});

export type CarField = keyof z.input<typeof carSchema>;

export const carStatusSchema = z.object({
  status: z.enum(CarOpStatus),
  /** Bilen har kommende bookinger: personalet har set listen og bekræfter. */
  confirm: checkbox,
});

export const odometerSchema = z.object({ odometerKm: int(0, 2_000_000) });

const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Planlagt værkstedsbesøg. Tider er lokale for bilens hjemsted. */
export const maintenanceSchema = z.object({
  type: z.enum(MaintenanceType),
  startDate: date,
  startTime: time,
  endDate: date,
  endTime: time,
  vendor: optionalText(100),
  notes: optionalText(1000),
  cost: optionalKroner,
});

export const maintenanceStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "DONE", "CANCELLED"]),
});

/** Katalogmodel: specifikationer, km-regler, depositum og beskrivelse på alle sprog. */
export const carModelSchema = z.object({
  categoryId: z.uuid(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .string()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .min(3)
        .max(80),
    ),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: int(1990, 2100),
  transmission: z.enum(Transmission),
  fuel: z.enum(Fuel),
  seats: int(1, 9),
  bags: int(0, 10),
  doors: int(2, 5),
  airConditioning: checkbox,
  includedKmPerDay: int(0, 5000),
  extraKmFee: kroner,
  deposit: kroner,
  descriptionDa: z.string().trim().min(1).max(1000),
  descriptionEn: optionalText(1000),
  descriptionAr: optionalText(1000),
  descriptionFr: optionalText(1000),
  isActive: checkbox,
  isFeatured: checkbox,
});

export type CarModelField = keyof z.input<typeof carModelSchema>;
