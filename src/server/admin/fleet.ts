import "server-only";
import { z } from "zod";
import type { CarOpStatus, Prisma } from "@/generated/prisma/client";
import { CarOpStatus as CarOpStatuses } from "@/generated/prisma/enums";
import { addDaysToKey, fromLocal, localDateKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  carSchema,
  carStatusSchema,
  maintenanceSchema,
  maintenanceStatusSchema,
  odometerSchema,
} from "@/lib/validation/fleet";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, can, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { isCarUnavailableError, violatedConstraint } from "@/server/db-errors";
import { ADMIN_PAGE_SIZE } from "./bookings";
import { ADMIN_TIME_ZONE, blockingBooking } from "./dashboard";

/** Frister, der vises som advarsel, når de er mindre end så mange dage væk. */
const WARN_DAYS = 30;

export const carFilterSchema = z.object({
  q: z.string().trim().max(40).optional().catch(undefined),
  status: z.enum(CarOpStatuses).optional().catch(undefined),
  location: z.uuid().optional().catch(undefined),
  model: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

export type CarFilter = z.infer<typeof carFilterSchema>;

type Deadlines = {
  odometerKm: number;
  insuranceExpiresAt: Date | null;
  nextInspectionDue: Date | null;
  nextServiceDue: Date | null;
  nextServiceKm: number | null;
};

/** Syn, service og forsikring, der er overskredet eller snart skal klares. */
export function carWarnings(car: Deadlines, now = new Date()) {
  const soon = addDaysToKey(localDateKey(now, ADMIN_TIME_ZONE), WARN_DAYS);
  const due = (date: Date | null) => date !== null && date.toISOString().slice(0, 10) <= soon;
  const warnings: ("inspection" | "service" | "insurance")[] = [];
  if (due(car.nextInspectionDue)) warnings.push("inspection");
  if (
    due(car.nextServiceDue) ||
    (car.nextServiceKm !== null && car.odometerKm >= car.nextServiceKm)
  ) {
    warnings.push("service");
  }
  if (due(car.insuranceExpiresAt)) warnings.push("insurance");
  return warnings;
}

/** Flådeoversigt med filtre (F4, 06-admin-flows.md). */
export async function listCars(ctx: PolicyContext, filter: CarFilter, now = new Date()) {
  assertCan(ctx, "fleet:read");
  const page = filter.page ?? 1;
  const where: Prisma.CarWhereInput = {
    ...(filter.status ? { opStatus: filter.status } : { opStatus: { not: "RETIRED" } }),
    ...(filter.location ? { homeLocationId: filter.location } : {}),
    ...(filter.model ? { carModelId: filter.model } : {}),
    ...(filter.q
      ? {
          OR: [
            { registrationNumber: { contains: filter.q, mode: "insensitive" } },
            { vin: { contains: filter.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [cars, total] = await Promise.all([
    db.car.findMany({
      where,
      orderBy: [
        { carModel: { brand: "asc" } },
        { carModel: { model: "asc" } },
        { registrationNumber: "asc" },
      ],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        registrationNumber: true,
        color: true,
        odometerKm: true,
        opStatus: true,
        insuranceExpiresAt: true,
        nextInspectionDue: true,
        nextServiceDue: true,
        nextServiceKm: true,
        carModel: { select: { brand: true, model: true } },
        homeLocation: { select: { name: true } },
      },
    }),
    db.car.count({ where }),
  ]);
  return {
    rows: cars.map((car) => ({ ...car, warnings: carWarnings(car, now) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

function assertId(id: string, message: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", message);
}

/** Kommende og igangværende bookinger på bilen (de holder bilen). */
function upcomingBookings(carId: string, now: Date) {
  return db.booking.findMany({
    where: { carId, blockedUntil: { gt: now }, ...blockingBooking(now) },
    orderBy: { pickupAt: "asc" },
    select: {
      id: true,
      reference: true,
      status: true,
      pickupAt: true,
      returnAt: true,
      customer: { select: { firstName: true, lastName: true } },
    },
  });
}

/** Én bil: stamdata, frister, kommende bookinger og værkstedsbesøg. Købspris kun for MANAGER+. */
export async function adminCar(ctx: PolicyContext, carId: string, now = new Date()) {
  assertCan(ctx, "fleet:read");
  assertId(carId, "Bilen findes ikke");
  const car = await db.car.findUnique({
    where: { id: carId },
    include: {
      carModel: { select: { id: true, brand: true, model: true, slug: true } },
      homeLocation: { select: { id: true, name: true, timezone: true } },
      maintenance: { orderBy: { startsAt: "desc" }, take: 50 },
    },
  });
  if (!car) throw new AppError("NOT_FOUND", "Bilen findes ikke");
  const bookings = await upcomingBookings(car.id, now);
  return {
    ...car,
    purchasePriceMinor: can(ctx, "car:readPurchasePrice") ? car.purchasePriceMinor : null,
    warnings: carWarnings(car, now),
    bookings,
  };
}

export type AdminCar = Awaited<ReturnType<typeof adminCar>>;

function carData(values: ReturnType<typeof carSchema.parse>) {
  const date = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);
  return {
    carModelId: values.carModelId,
    homeLocationId: values.homeLocationId,
    registrationNumber: values.registrationNumber,
    vin: values.vin,
    color: values.color,
    odometerKm: values.odometerKm,
    purchaseDate: date(values.purchaseDate),
    purchasePriceMinor: values.purchasePrice,
    insurancePolicy: values.insurancePolicy,
    insuranceExpiresAt: date(values.insuranceExpiresAt),
    nextInspectionDue: date(values.nextInspectionDue),
    nextServiceDue: date(values.nextServiceDue),
    nextServiceKm: values.nextServiceKm,
    tyreType: values.tyreType,
  };
}

/** Nummerplade og stelnummer er unikke; en dublet vises som fejl i feltet. */
function uniqueField(error: unknown): never {
  const constraint = violatedConstraint(error);
  if (constraint === "Car_registrationNumber_key") {
    throw new AppError("VALIDATION_FAILED", "Nummerpladen findes allerede", {
      fields: ["registrationNumber"],
      reason: "DUPLICATE",
    });
  }
  if (constraint === "Car_vin_key") {
    throw new AppError("VALIDATION_FAILED", "Stelnummeret findes allerede", {
      fields: ["vin"],
      reason: "DUPLICATE",
    });
  }
  throw error;
}

/** Ny bil i flåden (MANAGER+). */
export async function createCar(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "fleet:write");
  const data = carData(parseInput(carSchema, input));
  const actorUserId = ctx.actor!.userId;
  try {
    return await db.$transaction(async (tx) => {
      const car = await tx.car.create({ data, select: { id: true } });
      await audit(tx, {
        actorUserId,
        action: "car.create",
        entityType: "Car",
        entityId: car.id,
        diff: { registrationNumber: data.registrationNumber },
      });
      return car;
    });
  } catch (error) {
    uniqueField(error);
  }
}

/**
 * Ret en bil (MANAGER+). Model og hjemsted kan ikke skiftes, mens bilen har kommende bookinger:
 * bookingerne er lavet på den model og det sted. Km kan kun gå op.
 */
export async function updateCar(
  ctx: PolicyContext,
  carId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "fleet:write");
  assertId(carId, "Bilen findes ikke");
  const data = carData(parseInput(carSchema, input));
  const car = await db.car.findUnique({ where: { id: carId } });
  if (!car) throw new AppError("NOT_FOUND", "Bilen findes ikke");
  if (data.carModelId !== car.carModelId || data.homeLocationId !== car.homeLocationId) {
    const bookings = await upcomingBookings(car.id, now);
    if (bookings.length > 0) {
      throw new AppError("CONFLICT", "Bilen har kommende bookinger", {
        reason: "HAS_BOOKINGS",
        references: bookings.map((booking) => booking.reference),
      });
    }
  }
  if (!can(ctx, "car:readPurchasePrice")) {
    // Formularen viser ikke købet for roller uden adgang; behold de gemte værdier.
    data.purchaseDate = car.purchaseDate;
    data.purchasePriceMinor = car.purchasePriceMinor;
  }
  if (data.odometerKm < car.odometerKm) {
    throw new AppError("VALIDATION_FAILED", "Kilometertallet kan ikke gå ned", {
      fields: ["odometerKm"],
      reason: "ODOMETER_DOWN",
    });
  }
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
    (key) => String(data[key] ?? "") !== String(car[key] ?? ""),
  );
  try {
    await db.$transaction(async (tx) => {
      await tx.car.update({ where: { id: carId }, data });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "car.update",
        entityType: "Car",
        entityId: carId,
        diff: { fields: changed },
      });
    });
  } catch (error) {
    uniqueField(error);
  }
}

/**
 * Bilens driftsstatus (STAFF+). Kun ACTIVE biler kan bookes. Er bilen udlejet, kan status ikke
 * skiftes. Har den kommende bookinger, skal personalet se listen og bekræfte; bookingerne
 * beholder bilen, indtil de flyttes til en anden (F4). RETIRED kræver MANAGER+ og ingen bookinger.
 */
export async function setCarStatus(
  ctx: PolicyContext,
  carId: string,
  input: Record<string, unknown>,
  now = new Date(),
) {
  assertCan(ctx, "fleet:setStatus");
  assertId(carId, "Bilen findes ikke");
  const { status, confirm } = parseInput(carStatusSchema, input);
  if (status === "RETIRED") assertCan(ctx, "fleet:write");
  const car = await db.car.findUnique({ where: { id: carId }, select: { opStatus: true } });
  if (!car) throw new AppError("NOT_FOUND", "Bilen findes ikke");
  if (car.opStatus === status) return;

  if (status !== "ACTIVE") {
    const bookings = await upcomingBookings(carId, now);
    if (bookings.some((booking) => booking.status === "ACTIVE")) {
      throw new AppError("CONFLICT", "Bilen er udlejet", { reason: "RENTED" });
    }
    if (bookings.length > 0 && (status === "RETIRED" || !confirm)) {
      throw new AppError("CONFLICT", "Bilen har kommende bookinger", {
        reason: "HAS_BOOKINGS",
        references: bookings.map((booking) => booking.reference),
      });
    }
  }
  await db.$transaction(async (tx) => {
    const updated = await tx.car.updateMany({
      where: { id: carId, opStatus: car.opStatus },
      data: { opStatus: status },
    });
    if (updated.count === 0) throw new AppError("CONFLICT", "Bilen blev ændret samtidig");
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "car.status",
      entityType: "Car",
      entityId: carId,
      diff: { from: car.opStatus, to: status },
    });
  });
  logger.info({ carId, from: car.opStatus, to: status }, "car status changed");
}

/** Km-stand (STAFF+), fx efter en tur til værkstedet. Kan kun gå op. */
export async function updateOdometer(
  ctx: PolicyContext,
  carId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "fleet:setStatus");
  assertId(carId, "Bilen findes ikke");
  const { odometerKm } = parseInput(odometerSchema, input);
  await db.$transaction(async (tx) => {
    const updated = await tx.car.updateMany({
      where: { id: carId, odometerKm: { lte: odometerKm } },
      data: { odometerKm },
    });
    if (updated.count === 0) {
      const exists = await tx.car.count({ where: { id: carId } });
      if (!exists) throw new AppError("NOT_FOUND", "Bilen findes ikke");
      throw new AppError("VALIDATION_FAILED", "Kilometertallet kan ikke gå ned", {
        fields: ["odometerKm"],
        reason: "ODOMETER_DOWN",
      });
    }
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "car.odometer",
      entityType: "Car",
      entityId: carId,
      diff: { odometerKm },
    });
  });
}

/**
 * Planlagt værkstedsbesøg (STAFF+). Bilen kan ikke bookes i perioden. Overlapper perioden en
 * booking, afvises det med bookingnumrene, så de kan flyttes først (F4). Databasen håndhæver det.
 */
export async function addMaintenance(
  ctx: PolicyContext,
  carId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "fleet:setStatus");
  assertId(carId, "Bilen findes ikke");
  const values = parseInput(maintenanceSchema, input);
  const car = await db.car.findUnique({
    where: { id: carId },
    select: { odometerKm: true, homeLocation: { select: { timezone: true } } },
  });
  if (!car) throw new AppError("NOT_FOUND", "Bilen findes ikke");
  const zone = car.homeLocation.timezone;
  const startsAt = fromLocal(values.startDate, values.startTime, zone);
  const endsAt = fromLocal(values.endDate, values.endTime, zone);
  if (endsAt <= startsAt) {
    throw new AppError("VALIDATION_FAILED", "Slut skal ligge efter start", { fields: ["endDate"] });
  }
  const conflicts = await db.booking.findMany({
    where: {
      carId,
      status: { in: ["PENDING_PAYMENT", "CONFIRMED", "ACTIVE"] },
      blockedFrom: { lt: endsAt },
      blockedUntil: { gt: startsAt },
    },
    select: { reference: true },
  });
  if (conflicts.length > 0) {
    throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen har bookinger i perioden", {
      references: conflicts.map((booking) => booking.reference),
    });
  }
  try {
    return await db.$transaction(async (tx) => {
      const maintenance = await tx.maintenance.create({
        data: {
          carId,
          type: values.type,
          startsAt,
          endsAt,
          vendor: values.vendor,
          notes: values.notes,
          costMinor: values.cost,
          odometerKm: car.odometerKm,
        },
        select: { id: true },
      });
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "maintenance.create",
        entityType: "Car",
        entityId: carId,
        diff: { maintenanceId: maintenance.id, type: values.type },
      });
      return maintenance;
    });
  } catch (error) {
    if (violatedConstraint(error) === "maintenance_no_overlap") {
      throw new AppError("CONFLICT", "Bilen har allerede et værkstedsbesøg i perioden", {
        reason: "MAINTENANCE_OVERLAP",
      });
    }
    if (isCarUnavailableError(error)) {
      throw new AppError("CAR_NO_LONGER_AVAILABLE", "Bilen har bookinger i perioden");
    }
    throw error;
  }
}

const maintenanceTransitions: Record<string, readonly string[]> = {
  PLANNED: ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
};

/** Værkstedsbesøget går i gang, er færdigt eller aflyses (STAFF+). */
export async function setMaintenanceStatus(
  ctx: PolicyContext,
  maintenanceId: string,
  input: Record<string, unknown>,
) {
  assertCan(ctx, "fleet:setStatus");
  assertId(maintenanceId, "Værkstedsbesøget findes ikke");
  const { status } = parseInput(maintenanceStatusSchema, input);
  const maintenance = await db.maintenance.findUnique({
    where: { id: maintenanceId },
    select: { carId: true, status: true },
  });
  if (!maintenance) throw new AppError("NOT_FOUND", "Værkstedsbesøget findes ikke");
  if (!maintenanceTransitions[maintenance.status]?.includes(status)) {
    throw new AppError("CONFLICT", "Status kan ikke ændres", { from: maintenance.status });
  }
  await db.$transaction(async (tx) => {
    await tx.maintenance.update({ where: { id: maintenanceId }, data: { status } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "maintenance.status",
      entityType: "Car",
      entityId: maintenance.carId,
      diff: { maintenanceId, from: maintenance.status, to: status },
    });
  });
  return { carId: maintenance.carId };
}

/** Valgmuligheder til bilformularen. */
export async function carFormOptions(ctx: PolicyContext) {
  assertCan(ctx, "fleet:read");
  const [models, locations] = await Promise.all([
    db.carModel.findMany({
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      select: { id: true, brand: true, model: true },
    }),
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    models: models.map((model) => ({ id: model.id, name: `${model.brand} ${model.model}` })),
    locations,
  };
}

export type CarStatus = CarOpStatus;
