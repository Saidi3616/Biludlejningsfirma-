import "server-only";
import { createTranslator } from "next-intl";
import { feeRates, rentalRules } from "@/config/rental";
import { site } from "@/config/site";
import { AppError } from "@/lib/errors";
import { db } from "@/server/db";
import { getSiteContact } from "@/server/settings";
import da from "../../../messages/da.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

/**
 * Kontraktens sprog. Arabisk PDF kræver en font med arabisk skrift og højre-til-venstre-layout,
 * som PDF-motoren ikke understøtter godt; arabisktalende kunder får kontrakten på engelsk.
 */
export type ContractLocale = "da" | "en" | "fr";
const messages = { da, en, fr } satisfies Record<ContractLocale, typeof da>;

export function contractLocale(locale: string): ContractLocale {
  return locale === "da" || locale === "fr" ? locale : "en";
}

export function contractTranslator(locale: ContractLocale) {
  return createTranslator({ locale, messages: messages[locale] });
}

/**
 * Det, kunden underskriver: vilkår, priser, bil og periode som de er ved underskrift (03-database-erd,
 * CONTRACT.terms_snapshot). Teksterne gemmes færdigoversatte, så kontrakten aldrig ændrer sig,
 * når priser, vilkår eller oversættelser ændres senere.
 */
export type ContractSnapshot = {
  termsVersion: string;
  locale: ContractLocale;
  reference: string;
  landlord: { name: string; phone: string; email: string };
  renter: { name: string; email: string; phone: string | null };
  car: { name: string; registrationNumber: string };
  pickup: { location: string; at: string; timeZone: string };
  return: { location: string; at: string; timeZone: string };
  items: { label: string; totalMinor: number }[];
  totalMinor: number;
  depositMinor: number;
  currency: string;
  includedKmPerDay: number;
  extraKmFeeMinor: number;
  fuelPerEighthMinor: number;
  latePerHourMinor: number;
  graceMinutes: number;
  terms: { title: string; body: string }[];
};

const PLAIN = new Set([
  "DELIVERY_FEE",
  "ONE_WAY_FEE",
  "DISCOUNT",
  "FEE",
  "EXTRA_KM",
  "FUEL",
  "LATE_FEE",
  "DAMAGE",
]);

export async function buildContractSnapshot(bookingId: string): Promise<ContractSnapshot> {
  const contact = await getSiteContact();
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      reference: true,
      locale: true,
      termsVersion: true,
      pickupAt: true,
      returnAt: true,
      totalMinor: true,
      depositMinor: true,
      currency: true,
      customer: { select: { firstName: true, lastName: true, email: true, phoneE164: true } },
      carModel: {
        select: { brand: true, model: true, includedKmPerDay: true, extraKmFeeMinor: true },
      },
      car: { select: { registrationNumber: true } },
      pickupLocation: { select: { name: true, timezone: true } },
      returnLocation: { select: { name: true, timezone: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: { type: true, labelSnapshot: true, quantity: true, totalMinor: true },
      },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  const locale = contractLocale(booking.locale);
  const t = contractTranslator(locale);
  const label = (item: (typeof booking.items)[number]) => {
    if (item.type === "RENTAL") return t("car.lines.RENTAL", { days: item.quantity });
    if (item.type === "EXTRA" && item.quantity > 1) {
      return `${item.labelSnapshot} × ${item.quantity}`;
    }
    if (PLAIN.has(item.type)) return t(`car.lines.${item.type as "FEE"}`);
    return item.labelSnapshot;
  };
  return {
    termsVersion: booking.termsVersion ?? rentalRules.termsVersion,
    locale,
    reference: booking.reference,
    landlord: { name: site.name, phone: contact.phone, email: contact.email },
    renter: {
      name: `${booking.customer.firstName} ${booking.customer.lastName}`,
      email: booking.customer.email,
      phone: booking.customer.phoneE164,
    },
    car: {
      name: `${booking.carModel.brand} ${booking.carModel.model}`,
      registrationNumber: booking.car.registrationNumber,
    },
    pickup: {
      location: booking.pickupLocation.name,
      at: booking.pickupAt.toISOString(),
      timeZone: booking.pickupLocation.timezone,
    },
    return: {
      location: booking.returnLocation.name,
      at: booking.returnAt.toISOString(),
      timeZone: booking.returnLocation.timezone,
    },
    items: booking.items.map((item) => ({ label: label(item), totalMinor: item.totalMinor })),
    totalMinor: booking.totalMinor,
    depositMinor: booking.depositMinor,
    currency: booking.currency,
    includedKmPerDay: booking.carModel.includedKmPerDay,
    extraKmFeeMinor: booking.carModel.extraKmFeeMinor,
    fuelPerEighthMinor: feeRates.fuelPerEighthMinor,
    latePerHourMinor: feeRates.latePerHourMinor,
    graceMinutes: rentalRules.graceMinutes,
    terms: t.raw("terms.sections") as { title: string; body: string }[],
  };
}
