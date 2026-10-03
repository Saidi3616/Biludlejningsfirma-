import type { BadgeTone } from "./badge";

/**
 * Statusser fra datamodellen (docs/architecture/03-database-erd.md) og deres
 * farve. Farve er aldrig eneste signal: badget viser altid tekst og et ikon.
 */
export const bookingStatuses = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "NO_SHOW",
] as const;

export const paymentStatuses = [
  "UNPAID",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "FAILED",
] as const;

/** Den afledte bilstatus, som admin ser (se K2). */
export const carStatuses = [
  "AVAILABLE",
  "RESERVED",
  "RENTED",
  "RETURNED",
  "INSPECTION",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;

export type BookingStatus = (typeof bookingStatuses)[number];
export type PaymentStatus = (typeof paymentStatuses)[number];
export type CarStatus = (typeof carStatuses)[number];

export type StatusKind = "booking" | "payment" | "car";

export const statusTone: {
  booking: Record<BookingStatus, BadgeTone>;
  payment: Record<PaymentStatus, BadgeTone>;
  car: Record<CarStatus, BadgeTone>;
} = {
  booking: {
    PENDING_PAYMENT: "warning",
    CONFIRMED: "info",
    ACTIVE: "brand",
    COMPLETED: "success",
    CANCELLED: "neutral",
    EXPIRED: "neutral",
    NO_SHOW: "danger",
  },
  payment: {
    UNPAID: "warning",
    PAID: "success",
    PARTIALLY_REFUNDED: "info",
    REFUNDED: "neutral",
    FAILED: "danger",
  },
  car: {
    AVAILABLE: "success",
    RESERVED: "info",
    RENTED: "brand",
    RETURNED: "warning",
    INSPECTION: "warning",
    MAINTENANCE: "danger",
    OUT_OF_SERVICE: "neutral",
  },
};
