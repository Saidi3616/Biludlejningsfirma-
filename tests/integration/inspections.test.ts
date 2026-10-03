import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import {
  addModelImage,
  adminModel,
  deleteModelImage,
  makeModelImageFirst,
  MAX_MODEL_IMAGES,
} from "@/server/admin/models";
import type { PolicyContext } from "@/server/auth/policies";
import { getCar } from "@/server/catalog/service";
import { db } from "@/server/db";
import {
  addDamage,
  addDamagePhoto,
  addInspectionPhoto,
  bookingInspections,
  carHistory,
  handoverContext,
  inspectionDetail,
  markDamageRepaired,
  pickUp,
  privateDocument,
  receiveReturn,
} from "@/server/inspections/service";
import { localStorageProvider } from "@/server/storage/local";
import { storage, useStorageForTests } from "@/server/storage";
import { addPrices, bookingData, createFleet, resetDb, signedContract } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let staff: PolicyContext;
let manager: PolicyContext;
let root: string;

const now = new Date();
const HOUR = 3_600_000;

async function actor(role: Role): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email: `${role.toLowerCase()}@example.com`, name: role, role, emailVerified: true },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("forventede en fejl");
}

/** Et lille JPEG-foto med EXIF (kameramodel), som skal fjernes ved upload. */
async function photo(width = 3000, height = 2000) {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .withExif({ IFD0: { Make: "TestKamera", Model: "Hemmelig" } })
    .toBuffer();
  return new Uint8Array(buffer);
}

/** Bekræftet og betalt booking på bil A, afhentning for en time siden. */
async function paidBooking(options: { paid?: boolean; pickupInHours?: number } = {}) {
  const pickupAt = new Date(now.getTime() + (options.pickupInHours ?? -1) * HOUR);
  const returnAt = new Date(pickupAt.getTime() + 72 * HOUR);
  const booking = await db.booking.create({
    data: bookingData(fleet, fleet.carA.id, pickupAt.toISOString(), returnAt.toISOString()),
  });
  if (options.paid !== false) {
    await db.payment.create({
      data: {
        bookingId: booking.id,
        kind: "MANUAL",
        status: "SUCCEEDED",
        method: "CASH",
        amountMinor: booking.totalMinor,
        currency: "DKK",
        provider: "manual",
      },
    });
  }
  await signedContract(booking.id);
  return booking;
}

const handover = { odometerKm: "1200", fuelLevel: "8", notes: "Ekstra nøgle udleveret" };

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "storage-test-"));
  useStorageForTests(localStorageProvider(root));
});

afterAll(async () => {
  useStorageForTests(undefined);
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  staff = await actor("STAFF");
  manager = await actor("MANAGER");
});

describe("udlevering", () => {
  it("opretter inspektionen, opdaterer km og sætter bookingen til ACTIVE", async () => {
    const booking = await paidBooking();
    const inspection = await pickUp(staff, booking.id, handover, now);

    const saved = await db.inspection.findUniqueOrThrow({ where: { id: inspection.id } });
    expect(saved).toMatchObject({
      type: "PICKUP",
      odometerKm: 1200,
      fuelLevel: 8,
      notes: "Ekstra nøgle udleveret",
      bookingId: booking.id,
      carId: fleet.carA.id,
      performedByUserId: staff.actor!.userId,
    });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "ACTIVE",
    );
    expect((await db.car.findUniqueOrThrow({ where: { id: fleet.carA.id } })).odometerKm).toBe(
      1200,
    );
    const event = await db.bookingStatusEvent.findFirstOrThrow({
      where: { bookingId: booking.id, toStatus: "ACTIVE" },
    });
    expect(event).toMatchObject({ reason: "picked_up", actorUserId: staff.actor!.userId });
    expect(await db.auditLog.count({ where: { action: "booking.pickup" } })).toBe(1);
  });

  it("afviser ubetalt booking, for tidlig udlevering, lavere km og forkert status", async () => {
    const unpaid = await paidBooking({ paid: false });
    expect((await failure(pickUp(staff, unpaid.id, handover, now))).details).toMatchObject({
      reason: "UNPAID",
    });
    await db.contract.deleteMany({ where: { bookingId: unpaid.id } });
    await db.booking.delete({ where: { id: unpaid.id } });

    const later = await paidBooking({ pickupInHours: 72 });
    expect((await failure(pickUp(staff, later.id, handover, now))).details).toMatchObject({
      reason: "TOO_EARLY",
    });
    await db.payment.deleteMany({ where: { bookingId: later.id } });
    await db.contract.deleteMany({ where: { bookingId: later.id } });
    await db.booking.delete({ where: { id: later.id } });

    const booking = await paidBooking();
    expect(
      (await failure(pickUp(staff, booking.id, { ...handover, odometerKm: "999" }, now))).details,
    ).toMatchObject({ reason: "ODOMETER_DOWN" });
    await pickUp(staff, booking.id, handover, now);
    expect((await failure(pickUp(staff, booking.id, handover, now))).code).toBe("CONFLICT");
    // Kun én pickup-inspektion.
    expect(await db.inspection.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("kræver login og medarbejderrolle", async () => {
    const booking = await paidBooking();
    expect((await failure(pickUp({ actor: null }, booking.id, handover, now))).code).toBe(
      "UNAUTHENTICATED",
    );
    const customer = await actor("CUSTOMER");
    expect((await failure(pickUp(customer, booking.id, handover, now))).code).toBe("FORBIDDEN");
  });
});

describe("aflevering", () => {
  it("afslutter bookingen, sætter bilens status og sender tak-besked", async () => {
    const booking = await paidBooking();
    await pickUp(staff, booking.id, handover, now);
    expect(
      (
        await failure(
          receiveReturn(
            staff,
            booking.id,
            { odometerKm: "1100", fuelLevel: "6", notes: "", carStatus: "INSPECTION" },
            now,
          ),
        )
      ).details,
    ).toMatchObject({ reason: "ODOMETER_DOWN" });

    const inspection = await receiveReturn(
      staff,
      booking.id,
      { odometerKm: "1650", fuelLevel: "6", notes: "", carStatus: "INSPECTION" },
      now,
    );
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      "COMPLETED",
    );
    expect(await db.car.findUniqueOrThrow({ where: { id: fleet.carA.id } })).toMatchObject({
      odometerKm: 1650,
      opStatus: "INSPECTION",
    });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "booking.return" } });
    expect(log.diff).toMatchObject({ inspectionId: inspection.id, drivenKm: 450 });
    expect(
      await db.notification.count({ where: { bookingId: booking.id, template: "THANK_YOU" } }),
    ).toBe(1);

    const summary = await bookingInspections(staff, booking.id);
    expect(summary.map((row) => row.type)).toEqual(["PICKUP", "RETURN"]);
  });

  it("kan kun modtage en udleveret booking", async () => {
    const booking = await paidBooking();
    const result = await failure(
      receiveReturn(staff, booking.id, { ...handover, carStatus: "ACTIVE" }, now),
    );
    expect(result.code).toBe("CONFLICT");
  });
});

describe("fotos", () => {
  it("gemmer fotos privat som WebP uden metadata og højst 2000 px", async () => {
    const booking = await paidBooking();
    const inspection = await pickUp(staff, booking.id, handover, now);
    const document = await addInspectionPhoto(staff, inspection.id, await photo());

    const saved = await db.document.findUniqueOrThrow({ where: { id: document.id } });
    expect(saved).toMatchObject({
      ownerType: "INSPECTION",
      ownerId: inspection.id,
      kind: "PHOTO",
      mimeType: "image/webp",
      visibility: "PRIVATE",
    });
    expect(saved.storageKey).toMatch(/^private\/inspection\/[0-9a-f-]+\/[0-9a-f-]+\.webp$/);
    const stored = await storage().get(saved.storageKey);
    const meta = await sharp(stored!.body).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 2000, height: 1333 });
    expect(meta.exif).toBeUndefined();
    expect(saved.sizeBytes).toBe(stored!.body.byteLength);

    // Adgang: STAFF ja, kunde nej.
    expect((await privateDocument(staff, document.id)).storageKey).toBe(saved.storageKey);
    const customer = await actor("CUSTOMER");
    expect((await failure(privateDocument(customer, document.id))).code).toBe("FORBIDDEN");
  });

  it("afviser filer, der ikke er billeder", async () => {
    const booking = await paidBooking();
    const inspection = await pickUp(staff, booking.id, handover, now);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    for (const bytes of [new TextEncoder().encode("ikke et billede"), svg]) {
      expect(
        (await failure(addInspectionPhoto(staff, inspection.id, bytes))).details,
      ).toMatchObject({ reason: "NOT_IMAGE" });
    }
    expect(await db.document.count()).toBe(0);
  });
});

describe("skader", () => {
  it("skader ved udlevering er kendte; ved aflevering er de nye og hører til bookingen", async () => {
    const booking = await paidBooking();
    const pickup = await pickUp(staff, booking.id, handover, now);
    const existing = await addDamage(staff, pickup.id, {
      area: "rear-left",
      severity: "MINOR",
      description: "Ridse i kofangeren",
      liability: "",
      estimatedCost: "",
    });
    expect(await db.damage.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({
      origin: "EXISTING",
      liability: "INTERNAL",
      bookingId: null,
      carId: fleet.carA.id,
    });

    await addInspectionPhoto(staff, pickup.id, await photo(800, 600));
    const ret = await receiveReturn(
      staff,
      booking.id,
      { odometerKm: "1300", fuelLevel: "8", notes: "", carStatus: "ACTIVE" },
      now,
    );
    const fresh = await addDamage(staff, ret.id, {
      area: "windscreen",
      severity: "MODERATE",
      description: "Stenslag i forruden",
      liability: "CUSTOMER",
      estimatedCost: "1.500",
    });
    await addDamagePhoto(staff, fresh.id, await photo(800, 600));
    expect(await db.damage.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({
      origin: "NEW",
      liability: "CUSTOMER",
      bookingId: booking.id,
      estimatedCostMinor: 150000,
    });

    // Returinspektionen viser udleveringens fotos til sammenligning og begge skader.
    const detail = await inspectionDetail(staff, ret.id);
    expect(detail.others).toHaveLength(1);
    expect(detail.others[0]!.photos).toHaveLength(1);
    expect(detail.damages.map((damage) => damage.area)).toEqual(["rear-left", "windscreen"]);
    expect(detail.damages[1]!.photos).toHaveLength(1);

    // Den kendte skade vises ved næste udlevering, indtil den er udbedret.
    await markDamageRepaired(staff, existing.id);
    expect((await failure(markDamageRepaired(staff, existing.id))).code).toBe("CONFLICT");
    const next = await paidBooking({ pickupInHours: -0.5 });
    const context = await handoverContext(staff, next.id);
    expect(context.car.damages.map((damage) => damage.id)).toEqual([fresh.id]);

    const history = await carHistory(staff, fleet.carA.id);
    expect(history.damages).toHaveLength(2);
    expect(history.inspections).toHaveLength(2);
  });

  it("afviser ugyldige skader", async () => {
    const booking = await paidBooking();
    const pickup = await pickUp(staff, booking.id, handover, now);
    const result = await failure(
      addDamage(staff, pickup.id, { area: "motorhjelm", severity: "HUGE", description: "x" }),
    );
    expect(result.code).toBe("VALIDATION_FAILED");
    expect(result.details?.fields).toEqual(
      expect.arrayContaining(["area", "severity", "description"]),
    );
  });
});

describe("modelbilleder", () => {
  it("gemmer offentlige billeder, viser det første i kataloget og kan sortere og slette", async () => {
    await addPrices(fleet);
    expect((await failure(addModelImage(staff, fleet.carModel.id, await photo()))).code).toBe(
      "FORBIDDEN",
    );
    const first = await addModelImage(manager, fleet.carModel.id, await photo());
    const second = await addModelImage(manager, fleet.carModel.id, await photo(1000, 600));
    const model = await adminModel(manager, fleet.carModel.id);
    expect(model.images.map((image) => image.id)).toEqual([first.id, second.id]);
    const key = model.images[0]!.storageKey;
    expect(key).toMatch(/^public\/models\/[0-9a-f-]+\/[0-9a-f-]+\.webp$/);
    expect((await sharp((await storage().get(key))!.body).metadata()).width).toBe(1600);

    const car = await getCar(fleet.carModel.slug, { locale: "da", now });
    expect(car?.image).toEqual({
      url: `/media/${key.slice("public/".length)}`,
      alt: "Test Model",
    });

    await makeModelImageFirst(manager, second.id);
    expect((await adminModel(manager, fleet.carModel.id)).images[0]!.id).toBe(second.id);

    await deleteModelImage(manager, second.id);
    const secondKey = model.images[1]!.storageKey;
    expect(await storage().get(secondKey)).toBeNull();
    expect((await adminModel(manager, fleet.carModel.id)).images.map((image) => image.id)).toEqual([
      first.id,
    ]);
  });

  it("har et loft over antal billeder", async () => {
    const small = await photo(400, 300);
    for (let i = 0; i < MAX_MODEL_IMAGES; i++)
      await addModelImage(manager, fleet.carModel.id, small);
    expect((await failure(addModelImage(manager, fleet.carModel.id, small))).details).toMatchObject(
      { reason: "TOO_MANY" },
    );
  });
});
