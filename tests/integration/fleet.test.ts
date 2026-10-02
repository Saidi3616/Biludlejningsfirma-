import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { addDaysToKey, fromLocal, localDateKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import {
  addMaintenance,
  adminCar,
  carWarnings,
  createCar,
  listCars,
  setCarStatus,
  setMaintenanceStatus,
  updateCar,
  updateOdometer,
} from "@/server/admin/fleet";
import { adminModel, createModel, listModels, updateModel } from "@/server/admin/models";
import type { PolicyContext } from "@/server/auth/policies";
import { findFreeCars } from "@/server/availability/service";
import { db } from "@/server/db";
import { bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let staff: PolicyContext;
let manager: PolicyContext;

const TZ = "Europe/Copenhagen";
const now = new Date();
const day = (offset: number) => addDaysToKey(localDateKey(now, TZ), offset);

async function actor(role: Role): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email: `${role.toLowerCase()}@example.com`, name: role, role, emailVerified: true },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

/** Fanger AppError, så koden og detaljerne kan tjekkes. */
async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("forventede en fejl");
}

function carInput(overrides: Record<string, string> = {}) {
  return {
    carModelId: fleet.carModel.id,
    homeLocationId: fleet.location.id,
    registrationNumber: "cd  98 765",
    vin: "wvwzzz1kz8w123456",
    color: "Hvid",
    odometerKm: "12000",
    purchaseDate: "2025-03-01",
    purchasePrice: "189.000",
    insurancePolicy: "",
    insuranceExpiresAt: "",
    nextInspectionDue: "",
    nextServiceDue: "",
    nextServiceKm: "30000",
    tyreType: "",
    ...overrides,
  };
}

/** Booking på bil A om 10 dage (10:00–13:00 lokal tid). */
async function bookCarA(status: "CONFIRMED" | "ACTIVE" = "CONFIRMED") {
  const from = fromLocal(day(10), "10:00", TZ).toISOString();
  const to = fromLocal(day(13), "10:00", TZ).toISOString();
  return db.booking.create({ data: bookingData(fleet, fleet.carA.id, from, to, { status }) });
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  staff = await actor("STAFF");
  manager = await actor("MANAGER");
});

describe("biler", () => {
  it("opretter en bil med normaliseret nummerplade og VIN og skriver audit-log", async () => {
    const car = await createCar(manager, carInput());
    const saved = await db.car.findUniqueOrThrow({ where: { id: car!.id } });
    expect(saved).toMatchObject({
      registrationNumber: "CD 98 765",
      vin: "WVWZZZ1KZ8W123456",
      odometerKm: 12000,
      purchasePriceMinor: 18_900_000,
      nextServiceKm: 30000,
      insurancePolicy: null,
      opStatus: "ACTIVE",
    });
    expect(saved.purchaseDate?.toISOString().slice(0, 10)).toBe("2025-03-01");
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "car.create" } });
    expect(log.entityId).toBe(car!.id);
  });

  it("kun MANAGER+ kan oprette og rette biler", async () => {
    expect((await failure(createCar(staff, carInput()))).code).toBe("FORBIDDEN");
    expect((await failure(updateCar(staff, fleet.carA.id, carInput()))).code).toBe("FORBIDDEN");
  });

  it("afviser dublet-nummerplade og -VIN på det rigtige felt", async () => {
    const plate = await failure(
      createCar(manager, carInput({ registrationNumber: fleet.carA.registrationNumber })),
    );
    expect(plate).toMatchObject({
      code: "VALIDATION_FAILED",
      details: { fields: ["registrationNumber"], reason: "DUPLICATE" },
    });
    const vin = await failure(createCar(manager, carInput({ vin: fleet.carA.vin })));
    expect(vin.details).toMatchObject({ fields: ["vin"], reason: "DUPLICATE" });
  });

  it("afviser ugyldige felter", async () => {
    const result = await failure(
      createCar(manager, carInput({ vin: "IOQ", odometerKm: "-5", purchasePrice: "abc" })),
    );
    expect(result.code).toBe("VALIDATION_FAILED");
    expect(result.details?.fields).toEqual(
      expect.arrayContaining(["vin", "odometerKm", "purchasePrice"]),
    );
  });

  it("STAFF ser ikke købsprisen", async () => {
    await db.car.update({ where: { id: fleet.carA.id }, data: { purchasePriceMinor: 100 } });
    expect((await adminCar(staff, fleet.carA.id)).purchasePriceMinor).toBeNull();
    expect((await adminCar(manager, fleet.carA.id)).purchasePriceMinor).toBe(100);
  });

  it("model og hjemsted kan ikke skiftes, mens bilen har kommende bookinger", async () => {
    const booking = await bookCarA();
    const otherModel = await db.carModel.create({
      data: { ...modelRow(), slug: "anden-model", categoryId: fleet.carModel.categoryId },
    });
    const result = await failure(
      updateCar(
        manager,
        fleet.carA.id,
        carInput({
          carModelId: otherModel.id,
          registrationNumber: fleet.carA.registrationNumber,
          vin: fleet.carA.vin,
        }),
      ),
    );
    expect(result).toMatchObject({
      code: "CONFLICT",
      details: { reason: "HAS_BOOKINGS", references: [booking.reference] },
    });
    // Andre felter kan godt rettes.
    await updateCar(
      manager,
      fleet.carA.id,
      carInput({ registrationNumber: fleet.carA.registrationNumber, vin: fleet.carA.vin }),
    );
    expect((await db.car.findUniqueOrThrow({ where: { id: fleet.carA.id } })).color).toBe("Hvid");
  });

  it("km kan ikke gå ned", async () => {
    const result = await failure(
      updateCar(manager, fleet.carA.id, carInput({ odometerKm: "999" })),
    );
    expect(result.details).toMatchObject({ fields: ["odometerKm"], reason: "ODOMETER_DOWN" });
    expect(
      (await failure(updateOdometer(staff, fleet.carA.id, { odometerKm: "500" }))).details,
    ).toMatchObject({ reason: "ODOMETER_DOWN" });
    await updateOdometer(staff, fleet.carA.id, { odometerKm: "1500" });
    expect((await db.car.findUniqueOrThrow({ where: { id: fleet.carA.id } })).odometerKm).toBe(
      1500,
    );
  });

  it("lister biler med filtre og skjuler udfasede som standard", async () => {
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "RETIRED" } });
    expect((await listCars(staff, {})).rows.map((row) => row.id)).toEqual([fleet.carA.id]);
    expect((await listCars(staff, { status: "RETIRED" })).total).toBe(1);
    expect((await listCars(staff, { q: "te 00 000" })).total).toBe(1);
    expect((await listCars(staff, { q: "findes-ikke" })).total).toBe(0);
  });

  it("advarer om syn, service og forsikring inden for 30 dage og ved km", () => {
    const soon = new Date(`${day(10)}T00:00:00Z`);
    const later = new Date(`${day(60)}T00:00:00Z`);
    const base = {
      odometerKm: 1000,
      insuranceExpiresAt: later,
      nextInspectionDue: later,
      nextServiceDue: later,
      nextServiceKm: 2000,
    };
    expect(carWarnings(base, now)).toEqual([]);
    expect(
      carWarnings({ ...base, nextInspectionDue: soon, insuranceExpiresAt: soon }, now),
    ).toEqual(["inspection", "insurance"]);
    expect(carWarnings({ ...base, odometerKm: 2000 }, now)).toEqual(["service"]);
  });
});

describe("driftsstatus", () => {
  it("STAFF kan tage en bil uden bookinger ud af drift; den kan så ikke bookes", async () => {
    await setCarStatus(staff, fleet.carA.id, { status: "MAINTENANCE" });
    const free = await findFreeCars({
      carModelId: fleet.carModel.id,
      locationId: fleet.location.id,
      blockedFrom: fromLocal(day(10), "10:00", TZ),
      blockedUntil: fromLocal(day(11), "10:00", TZ),
      now,
    });
    expect(free.map((car) => car.id)).toEqual([fleet.carB.id]);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "car.status" } });
    expect(log.diff).toMatchObject({ from: "ACTIVE", to: "MAINTENANCE" });
  });

  it("kræver bekræftelse, når bilen har kommende bookinger", async () => {
    const booking = await bookCarA();
    const result = await failure(setCarStatus(staff, fleet.carA.id, { status: "OUT_OF_SERVICE" }));
    expect(result).toMatchObject({
      code: "CONFLICT",
      details: { reason: "HAS_BOOKINGS", references: [booking.reference] },
    });
    await setCarStatus(staff, fleet.carA.id, { status: "OUT_OF_SERVICE", confirm: "on" });
    expect((await db.car.findUniqueOrThrow({ where: { id: fleet.carA.id } })).opStatus).toBe(
      "OUT_OF_SERVICE",
    );
    // Bookingen beholder bilen, indtil personalet flytter den.
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).carId).toBe(
      fleet.carA.id,
    );
  });

  it("en udlejet bil kan ikke skifte status", async () => {
    await bookCarA("ACTIVE");
    const result = await failure(
      setCarStatus(staff, fleet.carA.id, { status: "MAINTENANCE", confirm: "on" }),
    );
    expect(result.details).toMatchObject({ reason: "RENTED" });
  });

  it("udfasning kræver MANAGER+ og ingen kommende bookinger", async () => {
    expect((await failure(setCarStatus(staff, fleet.carA.id, { status: "RETIRED" }))).code).toBe(
      "FORBIDDEN",
    );
    await bookCarA();
    const result = await failure(
      setCarStatus(manager, fleet.carA.id, { status: "RETIRED", confirm: "on" }),
    );
    expect(result.details).toMatchObject({ reason: "HAS_BOOKINGS" });
    await setCarStatus(manager, fleet.carB.id, { status: "RETIRED" });
  });
});

describe("værksted", () => {
  const visit = (overrides: Record<string, string> = {}) => ({
    type: "SERVICE",
    startDate: day(5),
    startTime: "08:00",
    endDate: day(5),
    endTime: "16:00",
    vendor: "Autoværkstedet",
    notes: "",
    cost: "1.250",
    ...overrides,
  });

  it("planlægger et besøg, som blokerer bilen i perioden", async () => {
    const created = await addMaintenance(staff, fleet.carA.id, visit());
    const saved = await db.maintenance.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved).toMatchObject({
      status: "PLANNED",
      costMinor: 125000,
      odometerKm: 1000,
      vendor: "Autoværkstedet",
      notes: null,
    });
    expect(saved.startsAt).toEqual(fromLocal(day(5), "08:00", TZ));
    // Databasen afviser nu en booking på bilen i perioden.
    const from = fromLocal(day(5), "10:00", TZ).toISOString();
    const to = fromLocal(day(6), "10:00", TZ).toISOString();
    await expect(
      db.booking.create({ data: bookingData(fleet, fleet.carA.id, from, to) }),
    ).rejects.toThrow();
  });

  it("afviser et besøg, der overlapper en booking, med bookingnumrene", async () => {
    const booking = await bookCarA();
    const result = await failure(
      addMaintenance(staff, fleet.carA.id, visit({ startDate: day(11), endDate: day(11) })),
    );
    expect(result).toMatchObject({
      code: "CAR_NO_LONGER_AVAILABLE",
      details: { references: [booking.reference] },
    });
  });

  it("afviser to besøg i samme periode og slut før start", async () => {
    await addMaintenance(staff, fleet.carA.id, visit());
    expect((await failure(addMaintenance(staff, fleet.carA.id, visit()))).details).toMatchObject({
      reason: "MAINTENANCE_OVERLAP",
    });
    expect(
      (await failure(addMaintenance(staff, fleet.carB.id, visit({ endTime: "07:00" })))).details,
    ).toMatchObject({ fields: ["endDate"] });
  });

  it("et færdigt eller aflyst besøg frigiver perioden og kan ikke åbnes igen", async () => {
    const created = await addMaintenance(staff, fleet.carA.id, visit());
    await setMaintenanceStatus(staff, created.id, { status: "IN_PROGRESS" });
    await setMaintenanceStatus(staff, created.id, { status: "DONE" });
    expect(
      (await failure(setMaintenanceStatus(staff, created.id, { status: "IN_PROGRESS" }))).code,
    ).toBe("CONFLICT");
    expect(
      (await failure(setMaintenanceStatus(staff, created.id, { status: "CANCELLED" }))).code,
    ).toBe("CONFLICT");
    // Perioden er fri igen.
    await addMaintenance(staff, fleet.carA.id, visit());
  });
});

function modelRow() {
  return {
    brand: "Skoda",
    model: "Octavia",
    year: 2024,
    transmission: "AUTOMATIC" as const,
    fuel: "DIESEL" as const,
    seats: 5,
    bags: 4,
    doors: 5,
    includedKmPerDay: 250,
    extraKmFeeMinor: 200,
    depositMinor: 400000,
  };
}

function modelInput(overrides: Record<string, string> = {}) {
  return {
    categoryId: fleet.carModel.categoryId,
    slug: "Skoda-Octavia-Combi",
    brand: "Skoda",
    model: "Octavia Combi",
    year: "2024",
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    seats: "5",
    bags: "4",
    doors: "5",
    airConditioning: "on",
    includedKmPerDay: "250",
    extraKmFee: "2,50",
    deposit: "4.000",
    descriptionDa: "Rummelig stationcar.",
    descriptionEn: "Spacious estate.",
    descriptionAr: "",
    descriptionFr: "",
    isActive: "on",
    isFeatured: "",
    ...overrides,
  };
}

describe("modeller", () => {
  it("opretter og retter en model med beskrivelser pr. sprog", async () => {
    const created = await createModel(manager, modelInput());
    const model = await adminModel(manager, created!.id);
    expect(model).toMatchObject({
      slug: "skoda-octavia-combi",
      extraKmFeeMinor: 250,
      depositMinor: 400000,
      airConditioning: true,
      isActive: true,
      isFeatured: false,
      descriptions: { da: "Rummelig stationcar.", en: "Spacious estate.", ar: "", fr: "" },
    });
    expect(model.descriptionI18n).toEqual({ da: "Rummelig stationcar.", en: "Spacious estate." });

    await updateModel(
      manager,
      created!.id,
      modelInput({ isActive: "", descriptionFr: "Break spacieux.", deposit: "5000" }),
    );
    const updated = await adminModel(manager, created!.id);
    expect(updated).toMatchObject({ isActive: false, depositMinor: 500000 });
    expect(updated.descriptions.fr).toBe("Break spacieux.");
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "carModel.update" } });
    expect(log.diff).toMatchObject({
      fields: expect.arrayContaining(["isActive", "depositMinor", "descriptionI18n"]),
    });
  });

  it("afviser dublet-adresse, ukendt kategori og STAFF", async () => {
    expect(
      (await failure(createModel(manager, modelInput({ slug: fleet.carModel.slug })))).details,
    ).toMatchObject({ fields: ["slug"], reason: "DUPLICATE" });
    expect(
      (
        await failure(
          createModel(manager, modelInput({ categoryId: "0190a5b4-0000-7000-8000-000000000000" })),
        )
      ).details,
    ).toMatchObject({ fields: ["categoryId"] });
    expect((await failure(createModel(staff, modelInput()))).code).toBe("FORBIDDEN");
  });

  it("lister modeller med antal biler i drift", async () => {
    await db.car.update({ where: { id: fleet.carB.id }, data: { opStatus: "RETIRED" } });
    const [model] = await listModels(staff);
    expect(model).toMatchObject({ slug: "test-model", category: "Economy", cars: 1 });
  });
});
