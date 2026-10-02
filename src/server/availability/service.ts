import "server-only";
import type { Location, OpeningHours } from "@/generated/prisma/client";
import { rentalRules } from "@/config/rental";
import { AppError } from "@/lib/errors";
import {
  availabilityCheckSchema,
  availabilitySearchSchema,
  type AvailabilityCheck,
  type AvailabilitySearch,
} from "@/lib/validation/availability";
import { parseInput } from "@/lib/validation/parse";
import { db } from "@/server/db";
import { getQuote } from "@/server/pricing/service";
import type { Quote } from "@/server/pricing/types";
import { isOpenAt, type OpeningHoursRule } from "./opening-hours";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type LocationWithHours = Location & { openingHours: OpeningHours[] };

export async function loadLocation(id: string): Promise<LocationWithHours> {
  const location = await db.location.findFirst({
    where: { id, isActive: true },
    include: { openingHours: true },
  });
  if (!location) throw new AppError("NOT_FOUND", "Lokationen findes ikke");
  return location;
}

function openingRules(location: LocationWithHours): OpeningHoursRule[] {
  return location.openingHours.map((row) => ({
    weekday: row.weekday,
    specialDate: row.specialDate ? row.specialDate.toISOString().slice(0, 10) : null,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    closed: row.closed,
  }));
}

export type RentalWindow = {
  pickupAt: Date;
  returnAt: Date;
  pickup: LocationWithHours;
  returnLocation: LocationWithHours;
};

/** Perioden bilen er optaget: lejen plus klargøring før (afhentningssted) og efter (afleveringssted). */
export function blockedPeriod({ pickupAt, returnAt, pickup, returnLocation }: RentalWindow) {
  return {
    blockedFrom: new Date(pickupAt.getTime() - pickup.bufferBeforeMinutes * MINUTE),
    blockedUntil: new Date(returnAt.getTime() + returnLocation.bufferAfterMinutes * MINUTE),
  };
}

/** Afviser perioder, der ikke kan bookes online: for tidligt, baglæns eller uden for åbningstid. */
export function assertBookableWindow(window: RentalWindow, now: Date) {
  const { pickupAt, returnAt, pickup, returnLocation } = window;
  if (returnAt <= pickupAt) {
    throw new AppError("VALIDATION_FAILED", "Afleveringen skal ligge efter afhentningen", {
      fields: ["returnAt"],
    });
  }
  if (pickupAt.getTime() < now.getTime() + rentalRules.minLeadMinutes * MINUTE) {
    throw new AppError("VALIDATION_FAILED", "Afhentningen ligger for tæt på", {
      fields: ["pickupAt"],
      reason: "TOO_SOON",
      minLeadMinutes: rentalRules.minLeadMinutes,
    });
  }
  if (!isOpenAt(pickupAt, pickup.timezone, openingRules(pickup))) {
    throw new AppError("OUTSIDE_OPENING_HOURS", "Afhentningsstedet har lukket på tidspunktet", {
      field: "pickupAt",
      locationId: pickup.id,
    });
  }
  if (!isOpenAt(returnAt, returnLocation.timezone, openingRules(returnLocation))) {
    throw new AppError("OUTSIDE_OPENING_HOURS", "Afleveringsstedet har lukket på tidspunktet", {
      field: "returnAt",
      locationId: returnLocation.id,
    });
  }
}

/**
 * Biler, der kan udlejes fra lokationen i perioden: aktive, uden overlappende booking og uden
 * planlagt vedligehold. Reservationer, hvis betalingsfrist er udløbet, tæller ikke med.
 * Sorteret med færrest kilometer først, så slitagen fordeles. Databasen har sidste ord
 * (EXCLUDE-constraint), så resultatet er et forslag, ikke en garanti.
 */
export async function findFreeCars(params: {
  locationId: string;
  blockedFrom: Date;
  blockedUntil: Date;
  now: Date;
  carModelId?: string;
  categoryId?: string | null;
}) {
  const { locationId, blockedFrom, blockedUntil, now, carModelId, categoryId } = params;
  return db.car.findMany({
    where: {
      homeLocationId: locationId,
      opStatus: "ACTIVE",
      ...(carModelId ? { carModelId } : {}),
      carModel: { isActive: true, ...(categoryId ? { categoryId } : {}) },
      bookings: {
        none: {
          blockedFrom: { lt: blockedUntil },
          blockedUntil: { gt: blockedFrom },
          OR: [
            { status: { in: ["CONFIRMED", "ACTIVE"] } },
            { status: "PENDING_PAYMENT", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
      },
      maintenance: {
        none: {
          status: { in: ["PLANNED", "IN_PROGRESS"] },
          startsAt: { lt: blockedUntil },
          endsAt: { gt: blockedFrom },
        },
      },
    },
    orderBy: [{ odometerKm: "asc" }, { id: "asc" }],
    select: { id: true, carModelId: true },
  });
}

export type AvailableModel = { carModelId: string; freeCars: number; quote: Quote };

async function loadWindow(input: {
  pickupLocationId: string;
  returnLocationId: string;
  pickupAt: Date;
  returnAt: Date;
}): Promise<RentalWindow> {
  const [pickup, returnLocation] = await Promise.all([
    loadLocation(input.pickupLocationId),
    loadLocation(input.returnLocationId),
  ]);
  return { pickupAt: input.pickupAt, returnAt: input.returnAt, pickup, returnLocation };
}

async function priceModels(
  window: RentalWindow,
  counts: Map<string, number>,
  customerId: string | null,
  now: Date,
): Promise<AvailableModel[]> {
  const priced = await Promise.all(
    [...counts].map(async ([carModelId, freeCars]) => {
      try {
        const quote = await getQuote(
          {
            carModelId,
            pickupLocationId: window.pickup.id,
            returnLocationId: window.returnLocation.id,
            pickupAt: window.pickupAt,
            returnAt: window.returnAt,
          },
          { customerId, now },
        );
        return { carModelId, freeCars, quote };
      } catch (error) {
        // En model uden pris kan ikke bookes og vises ikke.
        if (error instanceof AppError && error.code === "PRICE_UNAVAILABLE") return null;
        throw error;
      }
    }),
  );
  return priced
    .filter((model): model is AvailableModel => model !== null)
    .sort((a, b) => a.quote.totalMinor - b.quote.totalMinor);
}

function countByModel(cars: { carModelId: string }[]) {
  const counts = new Map<string, number>();
  for (const car of cars) counts.set(car.carModelId, (counts.get(car.carModelId) ?? 0) + 1);
  return counts;
}

/** Ledige modeller med totalpris, billigste først. */
export async function searchAvailability(
  request: AvailabilitySearch,
  context: { customerId?: string | null; now?: Date } = {},
): Promise<AvailableModel[]> {
  const input = parseInput(availabilitySearchSchema, request);
  const now = context.now ?? new Date();
  const window = await loadWindow(input);
  assertBookableWindow(window, now);

  const cars = await findFreeCars({
    locationId: window.pickup.id,
    ...blockedPeriod(window),
    now,
    categoryId: input.categoryId,
  });
  return priceModels(window, countByModel(cars), context.customerId ?? null, now);
}

export type AvailabilityResult = {
  available: boolean;
  freeCars: number;
  /** Når modellen er optaget: de næste perioder af samme længde, hvor den er ledig. */
  nextAvailable: { pickupAt: Date; returnAt: Date }[];
  /** Når modellen er optaget: andre ledige modeller i samme periode, billigste først. */
  alternatives: AvailableModel[];
};

/** Hvor mange dage frem vi leder efter en ledig periode for samme model. */
const NEXT_AVAILABLE_DAYS = 14;
const NEXT_AVAILABLE_MAX = 3;
const ALTERNATIVES_MAX = 3;

/** Er en bestemt model ledig? Hvis ikke: forslag til andre datoer og andre biler. */
export async function checkAvailability(
  request: AvailabilityCheck,
  context: { customerId?: string | null; now?: Date } = {},
): Promise<AvailabilityResult> {
  const input = parseInput(availabilityCheckSchema, request);
  const now = context.now ?? new Date();
  const window = await loadWindow(input);
  assertBookableWindow(window, now);

  const freeCars = await findFreeCars({
    locationId: window.pickup.id,
    ...blockedPeriod(window),
    now,
    carModelId: input.carModelId,
  });
  if (freeCars.length > 0) {
    return { available: true, freeCars: freeCars.length, nextAvailable: [], alternatives: [] };
  }

  const nextAvailable: AvailabilityResult["nextAvailable"] = [];
  for (
    let day = 1;
    day <= NEXT_AVAILABLE_DAYS && nextAvailable.length < NEXT_AVAILABLE_MAX;
    day++
  ) {
    const shifted: RentalWindow = {
      ...window,
      pickupAt: new Date(window.pickupAt.getTime() + day * DAY),
      returnAt: new Date(window.returnAt.getTime() + day * DAY),
    };
    try {
      assertBookableWindow(shifted, now);
    } catch {
      continue;
    }
    const cars = await findFreeCars({
      locationId: window.pickup.id,
      ...blockedPeriod(shifted),
      now,
      carModelId: input.carModelId,
    });
    if (cars.length > 0)
      nextAvailable.push({ pickupAt: shifted.pickupAt, returnAt: shifted.returnAt });
  }

  const others = await findFreeCars({
    locationId: window.pickup.id,
    ...blockedPeriod(window),
    now,
  });
  const alternatives = await priceModels(
    window,
    countByModel(others),
    context.customerId ?? null,
    now,
  );

  return {
    available: false,
    freeCars: 0,
    nextAvailable,
    alternatives: alternatives.slice(0, ALTERNATIVES_MAX),
  };
}
