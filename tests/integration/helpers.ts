import { db } from "@/server/db";
import { violatedConstraint as dbConstraint } from "@/server/db-errors";
import type { BookingStatus } from "@/generated/prisma/client";

/** Tømmer alle tabeller. Nægter at køre mod andet end en testdatabase. */
export async function resetDb() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith("_test") && !process.env.CI) {
    throw new Error(`Nægter at tømme databasen "${url.pathname}" (forventer *_test).`);
  }
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Minimal flåde: én lokation, én model, to biler og en kunde. */
export async function createFleet() {
  const location = await db.location.create({
    data: {
      slug: "test",
      name: "Test",
      address: "Testvej 1",
      postalCode: "1000",
      city: "København",
      lat: 55.67,
      lng: 12.56,
    },
  });
  const category = await db.carCategory.create({
    data: { slug: "economy", nameI18n: { da: "Economy" } },
  });
  const carModel = await db.carModel.create({
    data: {
      categoryId: category.id,
      slug: "test-model",
      brand: "Test",
      model: "Model",
      year: 2025,
      transmission: "AUTOMATIC",
      fuel: "PETROL",
      seats: 5,
      bags: 2,
      doors: 5,
      includedKmPerDay: 200,
      extraKmFeeMinor: 250,
      depositMinor: 300000,
    },
  });
  const [carA, carB] = await Promise.all(
    ["A", "B"].map((suffix, i) =>
      db.car.create({
        data: {
          carModelId: carModel.id,
          homeLocationId: location.id,
          registrationNumber: `TE 00 00${i}`,
          vin: `TEST0000000000${suffix}00`,
          odometerKm: 1000,
        },
      }),
    ),
  );
  const customer = await db.customer.create({
    data: { firstName: "Anna", lastName: "Jensen", email: "anna@example.com" },
  });
  return { location, carModel, carA: carA!, carB: carB!, customer };
}

type Fleet = Awaited<ReturnType<typeof createFleet>>;

let referenceCounter = 0;

/** Bookingdata for en bil i perioden [from, to). Bufferen er 0 medmindre angivet. */
export function bookingData(
  fleet: Fleet,
  carId: string,
  from: string,
  to: string,
  options: { status?: BookingStatus; bufferMinutes?: number } = {},
) {
  const buffer = (options.bufferMinutes ?? 0) * 60_000;
  const pickupAt = new Date(from);
  const returnAt = new Date(to);
  return {
    reference: `BK-T${++referenceCounter}-${Math.random().toString(36).slice(2, 7)}`,
    customerId: fleet.customer.id,
    carModelId: fleet.carModel.id,
    carId,
    pickupLocationId: fleet.location.id,
    returnLocationId: fleet.location.id,
    pickupAt,
    returnAt,
    blockedFrom: new Date(pickupAt.getTime() - buffer),
    blockedUntil: new Date(returnAt.getTime() + buffer),
    status: options.status ?? "CONFIRMED",
    subtotalMinor: 99900,
    totalMinor: 99900,
  };
}

/** Navnet på det database-constraint, der afviste forespørgslen (null hvis den lykkedes). */
export async function violatedConstraint(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return dbConstraint(error) ?? `ukendt fejl: ${(error as Error).message}`;
  }
}
