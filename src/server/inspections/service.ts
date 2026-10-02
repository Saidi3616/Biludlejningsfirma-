import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { localDateKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { netPaidMinor } from "@/lib/payments";
import { damageSchema, pickupSchema, returnSchema } from "@/lib/validation/inspections";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { applyTransition } from "@/server/booking/state";
import { db } from "@/server/db";
import { storePrivatePhoto } from "@/server/documents/images";

function assertId(id: string, message: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", message);
}

const openDamage = { repairedAt: null } satisfies Prisma.DamageWhereInput;

/** Det, personalet skal se før udlevering eller aflevering (F1, F2 i 06-admin-flows.md). */
export async function handoverContext(ctx: PolicyContext, bookingId: string) {
  assertCan(ctx, "inspection:write");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      status: true,
      pickupAt: true,
      returnAt: true,
      totalMinor: true,
      currency: true,
      depositStatus: true,
      depositMinor: true,
      settledAt: true,
      pickupLocation: { select: { timezone: true } },
      customer: { select: { firstName: true, lastName: true } },
      carModel: { select: { brand: true, model: true } },
      car: {
        select: {
          id: true,
          registrationNumber: true,
          odometerKm: true,
          damages: { where: openDamage, orderBy: { createdAt: "asc" } },
        },
      },
      payments: { select: { kind: true, status: true, amountMinor: true } },
      inspections: {
        orderBy: [{ performedAt: "asc" }, { type: "asc" }],
        select: { id: true, type: true, odometerKm: true },
      },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  return { ...booking, balanceMinor: booking.totalMinor - netPaidMinor(booking.payments) };
}

export type HandoverContext = Awaited<ReturnType<typeof handoverContext>>;

/**
 * Udlevering (F1): bekræftet og betalt booking med depositum, tidligst på afhentningsdagen. Km
 * kan ikke være lavere end bilens. Opretter pickup-inspektionen, opdaterer bilens km og sætter
 * bookingen til ACTIVE i én transaktion. Kørekort og kontrakt kommer i M12.
 */
export async function pickUp(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "inspection:write");
  const values = parseInput(pickupSchema, input);
  const booking = await handoverContext(ctx, bookingId);
  if (booking.status !== "CONFIRMED") {
    throw new AppError("CONFLICT", "Bookingen kan ikke udleveres", { from: booking.status });
  }
  if (booking.balanceMinor > 0) {
    throw new AppError("CONFLICT", "Bookingen er ikke betalt", { reason: "UNPAID" });
  }
  if (booking.depositStatus === "PENDING") {
    throw new AppError("CONFLICT", "Depositum mangler", { reason: "DEPOSIT_MISSING" });
  }
  const zone = booking.pickupLocation.timezone;
  if (localDateKey(now, zone) < localDateKey(booking.pickupAt, zone)) {
    throw new AppError("CONFLICT", "Det er ikke afhentningsdagen endnu", { reason: "TOO_EARLY" });
  }
  if (values.odometerKm < booking.car.odometerKm) {
    throw new AppError("VALIDATION_FAILED", "Kilometertallet kan ikke gå ned", {
      fields: ["odometerKm"],
      reason: "ODOMETER_DOWN",
    });
  }
  const actorUserId = ctx.actor!.userId;
  return db.$transaction(async (tx) => {
    const inspection = await tx.inspection.create({
      data: {
        bookingId,
        carId: booking.car.id,
        type: "PICKUP",
        odometerKm: values.odometerKm,
        fuelLevel: values.fuelLevel,
        notes: values.notes,
        performedByUserId: actorUserId,
        performedAt: now,
      },
      select: { id: true },
    });
    await tx.car.update({ where: { id: booking.car.id }, data: { odometerKm: values.odometerKm } });
    await applyTransition(tx, bookingId, "ACTIVE", { actorUserId, reason: "picked_up", now });
    await audit(tx, {
      actorUserId,
      action: "booking.pickup",
      entityType: "Booking",
      entityId: bookingId,
      diff: {
        inspectionId: inspection.id,
        odometerKm: values.odometerKm,
        fuelLevel: values.fuelLevel,
      },
    });
    return inspection;
  });
}

/**
 * Aflevering (F2): retur-inspektion, bilens km og driftsstatus, og bookingen → COMPLETED.
 * Tillæg og depositum afregnes bagefter (`settleBooking`), når fotos og skader er registreret.
 */
export async function receiveReturn(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "inspection:write");
  const values = parseInput(returnSchema, input);
  const booking = await handoverContext(ctx, bookingId);
  if (booking.status !== "ACTIVE") {
    throw new AppError("CONFLICT", "Bookingen er ikke udleveret", { from: booking.status });
  }
  const pickup = booking.inspections.find((inspection) => inspection.type === "PICKUP");
  const minimumKm = Math.max(pickup?.odometerKm ?? 0, booking.car.odometerKm);
  if (values.odometerKm < minimumKm) {
    throw new AppError("VALIDATION_FAILED", "Kilometertallet kan ikke gå ned", {
      fields: ["odometerKm"],
      reason: "ODOMETER_DOWN",
    });
  }
  const actorUserId = ctx.actor!.userId;
  return db.$transaction(async (tx) => {
    const inspection = await tx.inspection.create({
      data: {
        bookingId,
        carId: booking.car.id,
        type: "RETURN",
        odometerKm: values.odometerKm,
        fuelLevel: values.fuelLevel,
        notes: values.notes,
        performedByUserId: actorUserId,
        performedAt: now,
      },
      select: { id: true },
    });
    await tx.car.update({
      where: { id: booking.car.id },
      data: { odometerKm: values.odometerKm, opStatus: values.carStatus },
    });
    await applyTransition(tx, bookingId, "COMPLETED", { actorUserId, reason: "returned", now });
    await audit(tx, {
      actorUserId,
      action: "booking.return",
      entityType: "Booking",
      entityId: bookingId,
      diff: {
        inspectionId: inspection.id,
        odometerKm: values.odometerKm,
        fuelLevel: values.fuelLevel,
        carStatus: values.carStatus,
        drivenKm: pickup ? values.odometerKm - pickup.odometerKm : null,
      },
    });
    return inspection;
  });
}

const photoSelect = { id: true, createdAt: true } satisfies Prisma.DocumentSelect;

function photosOf(ownerType: "INSPECTION" | "DAMAGE", ownerIds: string[]) {
  if (ownerIds.length === 0) return Promise.resolve([]);
  return db.document.findMany({
    where: { ownerType, ownerId: { in: ownerIds }, kind: "PHOTO" },
    orderBy: { createdAt: "asc" },
    select: { ...photoSelect, ownerId: true },
  });
}

/** Inspektion med fotos og skader; ved retur også udleveringens fotos til sammenligning. */
export async function inspectionDetail(ctx: PolicyContext, inspectionId: string) {
  assertCan(ctx, "inspection:write");
  assertId(inspectionId, "Inspektionen findes ikke");
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      booking: {
        select: {
          id: true,
          reference: true,
          status: true,
          settledAt: true,
          pickupLocation: { select: { timezone: true } },
          customer: { select: { firstName: true, lastName: true } },
          inspections: {
            orderBy: [{ performedAt: "asc" }, { type: "asc" }],
            select: { id: true, type: true, odometerKm: true, fuelLevel: true, performedAt: true },
          },
        },
      },
      car: {
        select: {
          id: true,
          registrationNumber: true,
          carModel: { select: { brand: true, model: true } },
          homeLocation: { select: { timezone: true } },
          damages: { orderBy: { createdAt: "asc" } },
        },
      },
      performedBy: { select: { name: true } },
    },
  });
  if (!inspection) throw new AppError("NOT_FOUND", "Inspektionen findes ikke");

  const others =
    inspection.booking?.inspections.filter((other) => other.id !== inspection.id) ?? [];
  const damages = inspection.car.damages.filter(
    (damage) => damage.repairedAt === null || damage.detectedInInspectionId === inspection.id,
  );
  const [photos, otherPhotos, damagePhotos] = await Promise.all([
    photosOf("INSPECTION", [inspection.id]),
    photosOf(
      "INSPECTION",
      others.map((other) => other.id),
    ),
    photosOf(
      "DAMAGE",
      damages.map((damage) => damage.id),
    ),
  ]);
  return {
    ...inspection,
    timeZone: inspection.booking?.pickupLocation.timezone ?? inspection.car.homeLocation.timezone,
    photos,
    others: others.map((other) => ({
      ...other,
      photos: otherPhotos.filter((photo) => photo.ownerId === other.id),
    })),
    damages: damages.map((damage) => ({
      ...damage,
      photos: damagePhotos.filter((photo) => photo.ownerId === damage.id),
    })),
  };
}

export type InspectionDetail = Awaited<ReturnType<typeof inspectionDetail>>;

/** Foto til inspektionen (STAFF+). Billedet renses og gemmes privat. */
export async function addInspectionPhoto(
  ctx: PolicyContext,
  inspectionId: string,
  bytes: Uint8Array,
) {
  assertCan(ctx, "inspection:write");
  assertId(inspectionId, "Inspektionen findes ikke");
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: { id: true },
  });
  if (!inspection) throw new AppError("NOT_FOUND", "Inspektionen findes ikke");
  const actorUserId = ctx.actor!.userId;
  return storePrivatePhoto({
    ownerType: "INSPECTION",
    ownerId: inspectionId,
    bytes,
    onCreated: (tx, documentId) =>
      audit(tx, {
        actorUserId,
        action: "inspection.photo",
        entityType: "Inspection",
        entityId: inspectionId,
        diff: { documentId },
      }),
  });
}

/**
 * Skade fundet ved en inspektion (STAFF+). Ved udlevering er den eksisterende (bilen havde
 * den før lejen); ved aflevering er den ny og knyttes til bookingen. Ansvar og beløb kan
 * sættes nu; ved afregningen godkender en leder ansvar og beløb (`settleBooking`).
 */
export async function addDamage(
  ctx: PolicyContext,
  inspectionId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "damage:write");
  assertId(inspectionId, "Inspektionen findes ikke");
  const values = parseInput(damageSchema, input);
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: { id: true, type: true, carId: true, bookingId: true },
  });
  if (!inspection) throw new AppError("NOT_FOUND", "Inspektionen findes ikke");
  const isNew = inspection.type === "RETURN";
  const actorUserId = ctx.actor!.userId;
  return db.$transaction(async (tx) => {
    const damage = await tx.damage.create({
      data: {
        carId: inspection.carId,
        detectedInInspectionId: inspection.id,
        bookingId: isNew ? inspection.bookingId : null,
        area: values.area,
        severity: values.severity,
        origin: isNew ? "NEW" : "EXISTING",
        liability: isNew ? values.liability : "INTERNAL",
        description: values.description,
        estimatedCostMinor: values.estimatedCost,
      },
      select: { id: true },
    });
    await audit(tx, {
      actorUserId,
      action: "damage.create",
      entityType: "Car",
      entityId: inspection.carId,
      diff: {
        damageId: damage.id,
        area: values.area,
        severity: values.severity,
        origin: isNew ? "NEW" : "EXISTING",
      },
    });
    return damage;
  });
}

/** Foto af en skade (STAFF+). */
export async function addDamagePhoto(ctx: PolicyContext, damageId: string, bytes: Uint8Array) {
  assertCan(ctx, "damage:write");
  assertId(damageId, "Skaden findes ikke");
  const damage = await db.damage.findUnique({ where: { id: damageId }, select: { carId: true } });
  if (!damage) throw new AppError("NOT_FOUND", "Skaden findes ikke");
  const actorUserId = ctx.actor!.userId;
  return storePrivatePhoto({
    ownerType: "DAMAGE",
    ownerId: damageId,
    bytes,
    onCreated: (tx, documentId) =>
      audit(tx, {
        actorUserId,
        action: "damage.photo",
        entityType: "Car",
        entityId: damage.carId,
        diff: { damageId, documentId },
      }),
  });
}

/** Skaden er udbedret (STAFF+). Den vises så ikke længere som kendt skade ved udlevering. */
export async function markDamageRepaired(ctx: PolicyContext, damageId: string, now = new Date()) {
  assertCan(ctx, "damage:write");
  assertId(damageId, "Skaden findes ikke");
  return db.$transaction(async (tx) => {
    const damage = await tx.damage.findUnique({
      where: { id: damageId },
      select: { carId: true, repairedAt: true },
    });
    if (!damage) throw new AppError("NOT_FOUND", "Skaden findes ikke");
    if (damage.repairedAt) throw new AppError("CONFLICT", "Skaden er allerede udbedret");
    await tx.damage.update({ where: { id: damageId }, data: { repairedAt: now } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "damage.repaired",
      entityType: "Car",
      entityId: damage.carId,
      diff: { damageId },
    });
    return { carId: damage.carId };
  });
}

/** Bilens skader og inspektioner til bilsiden. */
export async function carHistory(ctx: PolicyContext, carId: string) {
  assertCan(ctx, "fleet:read");
  assertId(carId, "Bilen findes ikke");
  const [damages, inspections] = await Promise.all([
    db.damage.findMany({
      where: { carId },
      orderBy: [{ repairedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: 50,
      include: { booking: { select: { reference: true } } },
    }),
    db.inspection.findMany({
      where: { carId },
      orderBy: { performedAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        odometerKm: true,
        fuelLevel: true,
        performedAt: true,
        booking: { select: { reference: true } },
      },
    }),
  ]);
  return { damages, inspections };
}

/**
 * Et privat dokument til visning i admin. Kun fotos fra inspektioner og skader indtil
 * videre; kørekort og kontrakter får egne regler (M12, M15).
 */
export async function privateDocument(ctx: PolicyContext, documentId: string) {
  assertId(documentId, "Filen findes ikke");
  const document = await db.document.findUnique({
    where: { id: documentId },
    select: { ownerType: true, storageKey: true, mimeType: true },
  });
  if (!document) throw new AppError("NOT_FOUND", "Filen findes ikke");
  if (document.ownerType === "INSPECTION") assertCan(ctx, "inspection:write");
  else if (document.ownerType === "DAMAGE") assertCan(ctx, "damage:write");
  else throw new AppError("NOT_FOUND", "Filen findes ikke");
  return document;
}

/** Bookingens inspektioner til bookingsiden (udlevering og aflevering side om side). */
export async function bookingInspections(ctx: PolicyContext, bookingId: string) {
  assertCan(ctx, "booking:read");
  const inspections = await db.inspection.findMany({
    where: { bookingId },
    orderBy: [{ performedAt: "asc" }, { type: "asc" }],
    select: {
      id: true,
      type: true,
      odometerKm: true,
      fuelLevel: true,
      performedAt: true,
      _count: { select: { damages: true } },
    },
  });
  const photos = await db.document.groupBy({
    by: ["ownerId"],
    where: {
      ownerType: "INSPECTION",
      ownerId: { in: inspections.map((inspection) => inspection.id) },
    },
    _count: { _all: true },
  });
  return inspections.map(({ _count, ...inspection }) => ({
    ...inspection,
    damages: _count.damages,
    photos: photos.find((group) => group.ownerId === inspection.id)?._count._all ?? 0,
  }));
}
