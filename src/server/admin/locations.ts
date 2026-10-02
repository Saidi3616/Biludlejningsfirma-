import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  deliveryZoneSchema,
  locationSchema,
  specialDaySchema,
  weeklyHoursSchema,
} from "@/lib/validation/catalog";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { violatedConstraint } from "@/server/db-errors";

function assertId(id: string, message = "Lokationen findes ikke") {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", message);
}

/** Lokationer med antal biler og kommende afhentninger (F8). */
export async function listLocations(ctx: PolicyContext, now = new Date()) {
  assertCan(ctx, "catalog:write");
  const locations = await db.location.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      city: true,
      isActive: true,
      deliveryEnabled: true,
      _count: {
        select: {
          cars: { where: { opStatus: { not: "RETIRED" } } },
          pickupBookings: {
            where: { pickupAt: { gte: now }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
          },
        },
      },
    },
  });
  return locations.map(({ _count, ...location }) => ({
    ...location,
    cars: _count.cars,
    upcoming: _count.pickupBookings,
  }));
}

/** Én lokation med åbningstider, særlige dage og leveringszoner. */
export async function adminLocation(ctx: PolicyContext, locationId: string, now = new Date()) {
  assertCan(ctx, "catalog:write");
  assertId(locationId);
  const location = await db.location.findUnique({
    where: { id: locationId },
    include: {
      openingHours: { orderBy: [{ specialDate: "asc" }, { weekday: "asc" }, { opensAt: "asc" }] },
      deliveryZones: { orderBy: { maxDistanceKm: "asc" } },
      _count: {
        select: {
          cars: { where: { opStatus: { not: "RETIRED" } } },
          pickupBookings: {
            where: { pickupAt: { gte: now }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
          },
        },
      },
    },
  });
  if (!location) throw new AppError("NOT_FOUND", "Lokationen findes ikke");
  const weekly = location.openingHours.filter((row) => row.specialDate === null);
  const today = now.toISOString().slice(0, 10);
  return {
    ...location,
    lat: location.lat.toString(),
    lng: location.lng.toString(),
    cars: location._count.cars,
    upcoming: location._count.pickupBookings,
    /** Ugedag 1–7 → første periode. Uden rækker er lokationen ikke begrænset (selvbetjening). */
    weekly: [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
      const row = weekly.find((candidate) => candidate.weekday === weekday);
      return {
        weekday,
        opensAt: row?.opensAt ?? null,
        closesAt: row?.closesAt ?? null,
        closed: row ? row.closed : weekly.length > 0,
      };
    }),
    /** Ingen ugerækker (ubegrænset) eller døgnåbent alle syv dage. */
    open24h:
      weekly.length === 0 ||
      (weekly.length === 7 &&
        weekly.every((row) => !row.closed && row.opensAt === "00:00" && row.closesAt === "00:00")),
    specialDays: location.openingHours
      .filter((row) => row.specialDate !== null)
      .map((row) => ({ ...row, specialDate: row.specialDate!.toISOString().slice(0, 10) }))
      .filter((row) => row.specialDate >= today),
  };
}

export type AdminLocation = Awaited<ReturnType<typeof adminLocation>>;

function locationData(values: ReturnType<typeof locationSchema.parse>) {
  return {
    name: values.name,
    slug: values.slug,
    type: values.type,
    address: values.address,
    postalCode: values.postalCode,
    city: values.city,
    country: values.country,
    lat: values.lat,
    lng: values.lng,
    timezone: values.timezone,
    phone: values.phone,
    whatsapp: values.whatsapp,
    email: values.email,
    bufferBeforeMinutes: values.bufferBeforeMinutes,
    bufferAfterMinutes: values.bufferAfterMinutes,
    oneWayFeeMinor: values.oneWayFee,
    deliveryEnabled: values.deliveryEnabled,
    isActive: values.isActive,
  };
}

function duplicateSlug(error: unknown): never {
  if (violatedConstraint(error) === "Location_slug_key") {
    throw new AppError("VALIDATION_FAILED", "Adressen bruges allerede", {
      fields: ["slug"],
      reason: "DUPLICATE",
    });
  }
  throw error;
}

/** Ny lokation (MANAGER+). Åbningstider sættes bagefter på lokationens side. */
export async function createLocation(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "catalog:write");
  const data = locationData(parseInput(locationSchema, input));
  try {
    return await db.$transaction(async (tx) => {
      const location = await tx.location.create({ data, select: { id: true } });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "location.create",
        entityType: "Location",
        entityId: location.id,
        diff: { slug: data.slug, name: data.name },
      });
      return location;
    });
  } catch (error) {
    duplicateSlug(error);
  }
}

/**
 * Ret lokationen (MANAGER+). En deaktiveret lokation kan ikke vælges i nye bookinger; kommende
 * bookinger og bilerne der påvirkes ikke og skal flyttes manuelt, hvis stedet lukker.
 */
export async function updateLocation(
  ctx: PolicyContext,
  locationId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "catalog:write");
  assertId(locationId);
  const data = locationData(parseInput(locationSchema, input));
  const existing = await db.location.count({ where: { id: locationId } });
  if (!existing) throw new AppError("NOT_FOUND", "Lokationen findes ikke");
  try {
    return await db.$transaction(async (tx) => {
      await tx.location.update({ where: { id: locationId }, data });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "location.update",
        entityType: "Location",
        entityId: locationId,
        diff: {
          slug: data.slug,
          isActive: data.isActive,
          deliveryEnabled: data.deliveryEnabled,
          bufferBeforeMinutes: data.bufferBeforeMinutes,
          bufferAfterMinutes: data.bufferAfterMinutes,
          oneWayFeeMinor: data.oneWayFeeMinor,
        },
      });
      return { id: locationId };
    });
  } catch (error) {
    duplicateSlug(error);
  }
}

async function assertLocation(locationId: string) {
  assertId(locationId);
  const exists = await db.location.count({ where: { id: locationId } });
  if (!exists) throw new AppError("NOT_FOUND", "Lokationen findes ikke");
}

/** Døgnåbent alle ugens dage ("00:00" som lukketid er midnat). */
const ALWAYS_OPEN = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  opensAt: "00:00",
  closesAt: "00:00",
  closed: false,
}));

/**
 * Ugens åbningstider erstattes samlet (én periode pr. dag). `open24h` gemmer døgnåbent alle dage
 * som rækker, så en særlig dag kun påvirker sin egen dato. Særlige dage røres ikke.
 */
export async function setWeeklyHours(
  ctx: PolicyContext,
  locationId: string,
  input: { days: unknown; open24h: boolean },
) {
  assertCan(ctx, "catalog:write");
  await assertLocation(locationId);
  const days = input.open24h ? ALWAYS_OPEN : parseInput(weeklyHoursSchema, input.days);
  await db.$transaction(async (tx) => {
    await tx.openingHours.deleteMany({ where: { locationId, specialDate: null } });
    await tx.openingHours.createMany({
      data: days.map((day) => ({
        locationId,
        weekday: day.weekday,
        opensAt: day.closed ? null : day.opensAt,
        closesAt: day.closed ? null : day.closesAt,
        closed: day.closed,
      })),
    });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "location.hours",
      entityType: "Location",
      entityId: locationId,
      diff: {
        days: days.map((day) =>
          day.closed ? `${day.weekday}:lukket` : `${day.weekday}:${day.opensAt}-${day.closesAt}`,
        ),
      },
    });
  });
}

/** Særlig dag: erstatter ugedagens åbningstider den dag (fx juledag lukket). */
export async function addSpecialDay(
  ctx: PolicyContext,
  locationId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "catalog:write");
  await assertLocation(locationId);
  const values = parseInput(specialDaySchema, input);
  const specialDate = new Date(`${values.date}T00:00:00Z`);
  await db.$transaction(async (tx) => {
    // Uden ugerækker er lokationen ubegrænset; en særlig dag alene ville lukke alle andre dage.
    const weekly = await tx.openingHours.count({ where: { locationId, specialDate: null } });
    if (weekly === 0) {
      await tx.openingHours.createMany({
        data: ALWAYS_OPEN.map((day) => ({ locationId, ...day })),
      });
    }
    // Samme dato igen erstatter den tidligere.
    await tx.openingHours.deleteMany({ where: { locationId, specialDate } });
    await tx.openingHours.create({
      data: {
        locationId,
        specialDate,
        closed: values.closed,
        opensAt: values.closed ? null : values.opensAt,
        closesAt: values.closed ? null : values.closesAt,
      },
    });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "location.specialDay",
      entityType: "Location",
      entityId: locationId,
      diff: { date: values.date, closed: values.closed },
    });
  });
}

export async function removeSpecialDay(ctx: PolicyContext, locationId: string, rowId: string) {
  assertCan(ctx, "catalog:write");
  await assertLocation(locationId);
  assertId(rowId, "Dagen findes ikke");
  await db.$transaction(async (tx) => {
    const removed = await tx.openingHours.deleteMany({
      where: { id: rowId, locationId, specialDate: { not: null } },
    });
    if (removed.count === 0) throw new AppError("NOT_FOUND", "Dagen findes ikke");
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "location.specialDayRemoved",
      entityType: "Location",
      entityId: locationId,
      diff: { rowId },
    });
  });
}

/** Leveringszone: samme afstand igen erstatter gebyret. */
export async function saveDeliveryZone(
  ctx: PolicyContext,
  locationId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "catalog:write");
  await assertLocation(locationId);
  const values = parseInput(deliveryZoneSchema, input);
  await db.$transaction(async (tx) => {
    await tx.deliveryZone.upsert({
      where: { locationId_maxDistanceKm: { locationId, maxDistanceKm: values.maxDistanceKm } },
      create: { locationId, maxDistanceKm: values.maxDistanceKm, feeMinor: values.fee },
      update: { feeMinor: values.fee },
    });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "location.zone",
      entityType: "Location",
      entityId: locationId,
      diff: { maxDistanceKm: values.maxDistanceKm, feeMinor: values.fee },
    });
  });
}

export async function removeDeliveryZone(ctx: PolicyContext, locationId: string, zoneId: string) {
  assertCan(ctx, "catalog:write");
  await assertLocation(locationId);
  assertId(zoneId, "Zonen findes ikke");
  await db.$transaction(async (tx) => {
    const removed = await tx.deliveryZone.deleteMany({ where: { id: zoneId, locationId } });
    if (removed.count === 0) throw new AppError("NOT_FOUND", "Zonen findes ikke");
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "location.zoneRemoved",
      entityType: "Location",
      entityId: locationId,
      diff: { zoneId },
    });
  });
}
