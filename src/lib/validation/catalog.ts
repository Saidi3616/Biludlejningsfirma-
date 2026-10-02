import { z } from "zod";
import { DiscountType, ExtraPricing, LocationType } from "@/generated/prisma/enums";
import { kroner, parseKroner } from "./admin";
import { checkbox, int, optionalDate, optionalInt, optionalKroner, optionalText } from "./fleet";

const price = kroner.pipe(z.number().int().min(0).max(100_000_000));
const optionalId = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(z.uuid().nullable());

/**
 * Prisregel (F8, K3): et trin i kategoriens pristrappe, valgfrit kun for én model og/eller en
 * sæson. Pakkeprisen gælder præcis `minDays` dage; dagsprisen bruges op til næste trin.
 */
export const pricingRuleSchema = z
  .object({
    categoryId: z.uuid(),
    carModelId: optionalId,
    minDays: int(1, 365),
    packagePrice: price,
    perDayPrice: price,
    validFrom: optionalDate,
    validTo: optionalDate,
    priority: optionalInt(-100, 100).transform((value) => value ?? 0),
  })
  .refine((rule) => !rule.validFrom || !rule.validTo || rule.validFrom <= rule.validTo, {
    path: ["validTo"],
    message: "Slutdatoen er før startdatoen",
  });

export type PricingRuleField = keyof z.input<typeof pricingRuleSchema>;

/** "Hvad koster X dage?" på prissiden. */
export const pricePreviewSchema = z.object({
  carModelId: z.uuid(),
  days: int(1, 365),
  date: z.iso.date(),
});

const name = z.string().trim().min(1).max(80);
const optionalName = optionalText(80);
const description = optionalText(300);

/**
 * Ekstraudstyr (F8). Navnet skal findes på dansk; andre sprog falder tilbage til dansk, til de
 * er oversat. Loftet gælder kun pris pr. dag (fx højst 6 dages pris for en barnestol).
 */
export const extraSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9_]{1,39}$/),
    nameDa: name,
    nameEn: optionalName,
    nameAr: optionalName,
    nameFr: optionalName,
    descriptionDa: description,
    descriptionEn: description,
    descriptionAr: description,
    descriptionFr: description,
    pricing: z.enum(ExtraPricing),
    price,
    maxPrice: optionalKroner,
    maxQuantity: int(1, 10),
    stock: optionalInt(0, 10_000),
    sortOrder: optionalInt(0, 1000).transform((value) => value ?? 0),
    isActive: checkbox,
  })
  .refine((extra) => extra.pricing === "PER_DAY" || extra.maxPrice === null, {
    path: ["maxPrice"],
    message: "Loft gælder kun pris pr. dag",
  })
  .refine((extra) => extra.maxPrice === null || extra.maxPrice >= extra.price, {
    path: ["maxPrice"],
    message: "Loftet er lavere end prisen",
  });

export type ExtraField = keyof z.input<typeof extraSchema>;

const optionalUuidList = z
  .array(z.uuid())
  .max(200)
  .default([])
  .transform((ids) => [...new Set(ids)]);

/**
 * Rabatkode (F8). Procent er et helt tal 1–100; et fast beløb skrives i kroner. Perioden er hele
 * dage i virksomhedens tidszone. Tomme begrænsninger = gælder alle modeller.
 */
export const discountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,29}$/),
    type: z.enum(DiscountType),
    value: z.string().trim(),
    validFrom: optionalDate,
    validTo: optionalDate,
    minBooking: optionalKroner,
    minDays: optionalInt(1, 365),
    maxUses: optionalInt(1, 1_000_000),
    maxUsesPerCustomer: optionalInt(1, 1000),
    categoryIds: optionalUuidList,
    carModelIds: optionalUuidList,
    isActive: checkbox,
  })
  .transform((discount, ctx) => {
    let value: number | null = null;
    if (discount.type === "PERCENT") {
      value = /^\d{1,3}$/.test(discount.value) ? Number(discount.value) : null;
      if (value !== null && (value < 1 || value > 100)) value = null;
    } else {
      value = parseKroner(discount.value);
      if (value !== null && value < 100) value = null;
    }
    if (value === null) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Ugyldig rabat" });
      return z.NEVER;
    }
    if (discount.validFrom && discount.validTo && discount.validFrom > discount.validTo) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "Slutdatoen er før startdatoen" });
      return z.NEVER;
    }
    return { ...discount, value };
  });

export type DiscountField = keyof z.input<typeof discountSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalTime = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(hhmm.nullable());

/** Lokationens stamdata (F8). Koordinater bruges til kort og afstand ved levering. */
export const locationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(60),
  type: z.enum(LocationType),
  address: z.string().trim().min(2).max(120),
  postalCode: z.string().trim().min(2).max(12),
  city: z.string().trim().min(2).max(80),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  timezone: z.string().refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }),
  phone: optionalText(30),
  whatsapp: optionalText(30),
  email: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.email().max(254).nullable()),
  bufferBeforeMinutes: int(0, 24 * 60),
  bufferAfterMinutes: int(0, 24 * 60),
  oneWayFee: optionalKroner,
  deliveryEnabled: checkbox,
  isActive: checkbox,
});

export type LocationField = keyof z.input<typeof locationSchema>;

/** Ugens åbningstider: én periode pr. dag (1 = mandag … 7 = søndag) eller lukket. */
export const weeklyHoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      opensAt: optionalTime,
      closesAt: optionalTime,
      closed: z.boolean(),
    }),
  )
  .length(7)
  .superRefine((days, ctx) => {
    days.forEach((day, index) => {
      if (day.closed) return;
      // "00:00" som lukketid betyder midnat (se opening-hours.ts).
      const closes = day.closesAt === "00:00" ? "24:00" : day.closesAt;
      if (!day.opensAt || !closes || day.opensAt >= closes) {
        ctx.addIssue({ code: "custom", path: [index], message: "Ugyldige åbningstider" });
      }
    });
  });

/** En særlig dag (helligdag, lukket eller kortere åbent). */
export const specialDaySchema = z
  .object({
    date: z.iso.date(),
    closed: checkbox,
    opensAt: optionalTime,
    closesAt: optionalTime,
  })
  .refine(
    (day) => {
      if (day.closed) return true;
      const closes = day.closesAt === "00:00" ? "24:00" : day.closesAt;
      return Boolean(day.opensAt && closes && day.opensAt < closes);
    },
    { path: ["opensAt"], message: "Ugyldige åbningstider" },
  );

/** Leveringszone: op til `maxDistanceKm` km fra lokationen koster `fee`. */
export const deliveryZoneSchema = z.object({
  maxDistanceKm: int(1, 500),
  fee: kroner.pipe(z.number().int().min(0).max(10_000_000)),
});
