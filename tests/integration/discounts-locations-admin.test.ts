import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import {
  adminDiscount,
  createDiscount,
  deleteDiscount,
  discountOptions,
  listDiscounts,
  updateDiscount,
} from "@/server/admin/discounts";
import {
  addSpecialDay,
  adminLocation,
  createLocation,
  listLocations,
  removeDeliveryZone,
  removeSpecialDay,
  saveDeliveryZone,
  setWeeklyHours,
  updateLocation,
} from "@/server/admin/locations";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { getQuote } from "@/server/pricing/service";
import { addPrices, bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let manager: PolicyContext;
let staff: PolicyContext;

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

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  manager = await actor("MANAGER");
  staff = await actor("STAFF");
});

const discount = (overrides: Record<string, unknown> = {}) => ({
  code: "sommer25",
  type: "PERCENT",
  value: "10",
  validFrom: "",
  validTo: "",
  minBooking: "",
  minDays: "",
  maxUses: "",
  maxUsesPerCustomer: "",
  categoryIds: [],
  carModelIds: [],
  isActive: "on",
  ...overrides,
});

describe("rabatkoder (F8)", () => {
  it("opretter en kode, som bruges i nye tilbud, og retter den", async () => {
    await addPrices(fleet);
    const created = await createDiscount(
      manager,
      discount({ categoryIds: [fleet.carModel.categoryId], minDays: "2" }),
    );
    expect(await adminDiscount(manager, created!.id)).toMatchObject({
      code: "SOMMER25",
      value: 10,
      currency: null,
      minDays: 2,
      categoryIds: [fleet.carModel.categoryId],
      used: 0,
      givenMinor: 0,
    });
    const quoteInput = {
      carModelId: fleet.carModel.id,
      pickupLocationId: fleet.location.id,
      returnLocationId: fleet.location.id,
      pickupAt: "2027-03-01T08:00:00.000Z",
      returnAt: "2027-03-04T08:00:00.000Z",
      discountCode: "SOMMER25",
    };
    const quote = await getQuote(quoteInput, { now: new Date("2027-01-01") });
    expect(quote.discountMinor).toBe(9990);

    // Fast beløb og periode i dansk tid: sidste dag gælder til midnat.
    await updateDiscount(
      manager,
      created!.id,
      discount({ type: "FIXED", value: "150", validFrom: "2027-01-01", validTo: "2027-03-01" }),
    );
    const updated = await adminDiscount(manager, created!.id);
    expect(updated).toMatchObject({
      value: 15000,
      currency: "DKK",
      validFrom: "2027-01-01",
      validTo: "2027-03-01",
      categoryIds: [],
    });
    expect(updated.validFrom!).toBe("2027-01-01");
    const stored = await db.discount.findUniqueOrThrow({ where: { id: created!.id } });
    expect(stored.validFrom?.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(stored.validTo?.toISOString()).toBe("2027-03-01T22:59:59.999Z");
    expect(
      (await getQuote(quoteInput, { now: new Date("2027-03-01T22:00:00Z") })).discountMinor,
    ).toBe(15000);
    expect(
      await failure(getQuote(quoteInput, { now: new Date("2027-03-01T23:30:00Z") })),
    ).toMatchObject({ code: "DISCOUNT_INVALID", details: { reason: "EXPIRED" } });

    expect(await listDiscounts(manager)).toEqual([
      expect.objectContaining({ code: "SOMMER25", used: 0, restricted: false }),
    ]);
    expect(await discountOptions(manager)).toEqual([
      expect.objectContaining({
        id: fleet.carModel.categoryId,
        models: [{ id: fleet.carModel.id, name: "Test Model" }],
      }),
    ]);
  });

  it("afviser ugyldige værdier, dobbelt kode og ukendte modeller", async () => {
    expect(await failure(createDiscount(manager, discount({ value: "101" })))).toMatchObject({
      details: { fields: ["value"] },
    });
    expect(
      await failure(createDiscount(manager, discount({ type: "FIXED", value: "0,50" }))),
    ).toMatchObject({ details: { fields: ["value"] } });
    expect(await failure(createDiscount(manager, discount({ code: "a b" })))).toMatchObject({
      details: { fields: ["code"] },
    });
    expect(
      await failure(
        createDiscount(manager, discount({ validFrom: "2027-02-01", validTo: "2027-01-01" })),
      ),
    ).toMatchObject({ details: { fields: ["validTo"] } });
    expect(
      await failure(
        createDiscount(
          manager,
          discount({ carModelIds: ["0190a0a0-0000-7000-8000-000000000000"] }),
        ),
      ),
    ).toMatchObject({ details: { fields: ["categoryIds"] } });
    await createDiscount(manager, discount());
    expect(await failure(createDiscount(manager, discount({ code: "Sommer25" })))).toMatchObject({
      details: { fields: ["code"], reason: "DUPLICATE" },
    });
  });

  it("en brugt kode kan ikke slettes eller omdøbes, men kan deaktiveres", async () => {
    const used = await createDiscount(manager, discount());
    const unused = await createDiscount(manager, discount({ code: "VINTER" }));
    await db.booking.create({
      data: {
        ...bookingData(fleet, fleet.carA.id, "2027-03-01T08:00:00Z", "2027-03-04T08:00:00Z"),
        discountId: used!.id,
      },
    });
    expect(await failure(deleteDiscount(manager, used!.id))).toMatchObject({
      code: "CONFLICT",
      details: { reason: "IN_USE" },
    });
    expect(
      await failure(updateDiscount(manager, used!.id, discount({ code: "NYKODE" }))),
    ).toMatchObject({ details: { fields: ["code"], reason: "IN_USE" } });
    await updateDiscount(manager, used!.id, discount({ isActive: "" }));
    expect((await adminDiscount(manager, used!.id)).isActive).toBe(false);
    await deleteDiscount(manager, unused!.id);
    expect(await db.discount.count()).toBe(1);
    const actions = await db.auditLog.findMany({
      where: { entityType: "Discount" },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action)).toEqual([
      "discount.create",
      "discount.create",
      "discount.update",
      "discount.delete",
    ]);
  });

  it("kræver MANAGER", async () => {
    expect((await failure(listDiscounts(staff))).code).toBe("FORBIDDEN");
    expect((await failure(createDiscount(staff, discount()))).code).toBe("FORBIDDEN");
  });
});

const location = (overrides: Record<string, string> = {}) => ({
  name: "Kastrup Lufthavn",
  slug: "Kastrup",
  type: "AIRPORT",
  address: "Lufthavnsboulevarden 6",
  postalCode: "2770",
  city: "Kastrup",
  country: "dk",
  lat: "55.6180",
  lng: "12.6508",
  timezone: "Europe/Copenhagen",
  phone: "",
  whatsapp: "",
  email: "",
  bufferBeforeMinutes: "60",
  bufferAfterMinutes: "90",
  oneWayFee: "250",
  deliveryEnabled: "",
  isActive: "on",
  ...overrides,
});

const week = (opensAt = "08:00", closesAt = "18:00") =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    opensAt: weekday === 7 ? "" : opensAt,
    closesAt: weekday === 7 ? "" : closesAt,
    closed: weekday === 7,
  }));

describe("lokationer (F8)", () => {
  it("opretter og retter en lokation; deaktiveret kan ikke bookes", async () => {
    const created = await createLocation(manager, location());
    const loaded = await adminLocation(manager, created!.id);
    expect(loaded).toMatchObject({
      slug: "kastrup",
      country: "DK",
      lat: "55.618",
      oneWayFeeMinor: 25000,
      bufferAfterMinutes: 90,
      open24h: true,
      cars: 0,
    });
    expect(await failure(createLocation(manager, location({ name: "Andet" })))).toMatchObject({
      details: { fields: ["slug"], reason: "DUPLICATE" },
    });
    expect(
      await failure(createLocation(manager, location({ slug: "x-2", timezone: "Mars/Olympus" }))),
    ).toMatchObject({ details: { fields: ["timezone"] } });

    await addPrices(fleet);
    await updateLocation(manager, fleet.location.id, {
      ...location({ slug: "test", name: "Test", isActive: "", oneWayFee: "" }),
    });
    expect(
      await failure(
        getQuote(
          {
            carModelId: fleet.carModel.id,
            pickupLocationId: fleet.location.id,
            returnLocationId: fleet.location.id,
            pickupAt: "2027-03-01T08:00:00.000Z",
            returnAt: "2027-03-04T08:00:00.000Z",
          },
          { now: new Date("2027-01-01") },
        ),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect((await listLocations(manager)).map((l) => [l.slug, l.isActive, l.cars])).toEqual([
      ["kastrup", true, 0],
      ["test", false, 2],
    ]);
  });

  it("åbningstider, særlige dage og leveringszoner", async () => {
    const id = fleet.location.id;
    const now = new Date("2027-01-01T12:00:00Z");
    await setWeeklyHours(manager, id, { days: week(), open24h: false });
    let loaded = await adminLocation(manager, id, now);
    expect(loaded.open24h).toBe(false);
    expect(loaded.weekly[0]).toEqual({
      weekday: 1,
      opensAt: "08:00",
      closesAt: "18:00",
      closed: false,
    });
    expect(loaded.weekly[6]).toMatchObject({ weekday: 7, closed: true });

    expect(
      await failure(setWeeklyHours(manager, id, { days: week("18:00", "08:00"), open24h: false })),
    ).toMatchObject({ code: "VALIDATION_FAILED" });

    await addSpecialDay(manager, id, {
      date: "2027-12-24",
      closed: "on",
      opensAt: "",
      closesAt: "",
    });
    await addSpecialDay(manager, id, {
      date: "2027-12-24",
      closed: "",
      opensAt: "09:00",
      closesAt: "12:00",
    });
    loaded = await adminLocation(manager, id, now);
    expect(loaded.specialDays).toEqual([
      expect.objectContaining({ specialDate: "2027-12-24", opensAt: "09:00", closed: false }),
    ]);
    await removeSpecialDay(manager, id, loaded.specialDays[0]!.id);

    // Døgnåbent gemmes som rækker, så en særlig dag kun lukker sin egen dato.
    await setWeeklyHours(manager, id, { days: null, open24h: true });
    await addSpecialDay(manager, id, {
      date: "2027-12-25",
      closed: "on",
      opensAt: "",
      closesAt: "",
    });
    loaded = await adminLocation(manager, id, now);
    expect(loaded.open24h).toBe(true);
    expect(loaded.weekly.every((day) => day.opensAt === "00:00" && !day.closed)).toBe(true);

    await saveDeliveryZone(manager, id, { maxDistanceKm: "10", fee: "200" });
    await saveDeliveryZone(manager, id, { maxDistanceKm: "10", fee: "250" });
    await saveDeliveryZone(manager, id, { maxDistanceKm: "25", fee: "400" });
    loaded = await adminLocation(manager, id, now);
    expect(loaded.deliveryZones.map((zone) => [zone.maxDistanceKm, zone.feeMinor])).toEqual([
      [10, 25000],
      [25, 40000],
    ]);
    await removeDeliveryZone(manager, id, loaded.deliveryZones[1]!.id);
    expect(await db.deliveryZone.count()).toBe(1);
  });

  it("en ny lokation uden ugetider bliver døgnåben, når der tilføjes en særlig dag", async () => {
    const created = await createLocation(manager, location());
    await addSpecialDay(manager, created!.id, {
      date: "2027-12-25",
      closed: "on",
      opensAt: "",
      closesAt: "",
    });
    const rows = await db.openingHours.count({
      where: { locationId: created!.id, specialDate: null },
    });
    expect(rows).toBe(7);
  });

  it("kræver MANAGER", async () => {
    expect((await failure(listLocations(staff))).code).toBe("FORBIDDEN");
    expect((await failure(createLocation(staff, location()))).code).toBe("FORBIDDEN");
  });
});
