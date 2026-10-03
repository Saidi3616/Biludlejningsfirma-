import type { BookingItemType, DiscountType, ExtraPricing } from "@/generated/prisma/enums";

/**
 * Data, prismotoren regner på. Alt hentes af `service.ts`, så `quote()` er en ren funktion
 * uden database, som kan testes med faste tal.
 */

export type PriceRule = {
  id: string;
  carModelId: string | null;
  minDays: number;
  packageMinor: number;
  perDayMinor: number;
  currency: string;
  /** Lokal dato "YYYY-MM-DD", inklusive. */
  validFrom: string | null;
  validTo: string | null;
  priority: number;
};

export type PricedModel = {
  id: string;
  categoryId: string;
  depositMinor: number;
  includedKmPerDay: number;
  extraKmFeeMinor: number;
  currency: string;
};

export type PricedExtra = {
  id: string;
  code: string;
  pricing: ExtraPricing;
  priceMinor: number;
  maxPriceMinor: number | null;
  maxQuantity: number;
  currency: string;
  isActive: boolean;
};

export type PricedDiscount = {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  currency: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  minBookingMinor: number | null;
  minDays: number | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  isActive: boolean;
  /** Tom = gælder alle. */
  categoryIds: string[];
  carModelIds: string[];
  /** Antal gange koden er brugt i alt og af denne kunde (0 hvis kunden er ukendt). */
  usedTotal: number;
  usedByCustomer: number;
};

export type DeliveryZoneData = { maxDistanceKm: number; feeMinor: number; currency: string };

export type QuoteInput = {
  pickupAt: Date;
  returnAt: Date;
  /** Afhentningsstedets tidszone; lejedage og sæsonpriser regnes i den. */
  timeZone: string;
  model: PricedModel;
  rules: PriceRule[];
  extras: { extra: PricedExtra; quantity: number }[];
  /** Levering til kundens adresse fra afhentningsstedet. */
  delivery: { enabled: boolean; zones: DeliveryZoneData[]; distanceKm: number } | null;
  /** Gebyr når bilen afleveres et andet sted, end den blev hentet (null = ingen). */
  oneWayFeeMinor: number | null;
  discount: PricedDiscount | null;
  now: Date;
};

export type QuoteLine = {
  type: BookingItemType;
  /** Ekstraudstyrets kode, ellers linjetypen. UI oversætter ud fra den. */
  code: string;
  extraId?: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
};

export type Quote = {
  currency: string;
  rentalDays: number;
  /** Den pristrappe, lejen er beregnet efter, og om prisen er loftet af næste pakke (K3). */
  tier: {
    minDays: number;
    perDayMinor: number;
    packageMinor: number;
    cappedByNextPackage: boolean;
  };
  /** Leje, ekstraudstyr og gebyrer. Rabatten står som en negativ linje til sidst. */
  lines: QuoteLine[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  /** Momsandelen af totalen (alle priser er inkl. moms). */
  vatMinor: number;
  /** Ikke en del af totalen. HOLD: reserveres på kortet ved afhentning; CHARGE: trækkes og refunderes (K6). */
  deposit: { amountMinor: number; mode: "HOLD" | "CHARGE" };
  /** Vises under "Ikke inkluderet" (K14). */
  includedKm: number;
  extraKmFeeMinor: number;
  discountCode: string | null;
};
