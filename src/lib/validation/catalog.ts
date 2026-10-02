import { z } from "zod";
import { ExtraPricing } from "@/generated/prisma/enums";
import { kroner } from "./admin";
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
