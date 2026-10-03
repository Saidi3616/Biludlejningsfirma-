import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import {
  adminExtra,
  createExtra,
  deleteExtra,
  listExtras,
  updateExtra,
} from "@/server/admin/extras";
import {
  createPricingRule,
  deletePricingRule,
  pricePreview,
  pricingOverview,
  pricingRule,
  updatePricingRule,
} from "@/server/admin/pricing";
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

const rule = (overrides: Record<string, string> = {}) => ({
  categoryId: fleet.carModel.categoryId,
  carModelId: "",
  minDays: "1",
  packagePrice: "399",
  perDayPrice: "399",
  validFrom: "",
  validTo: "",
  priority: "",
  ...overrides,
});

describe("prisregler (F8)", () => {
  it("advarer, når kategorien mangler en standardpris for 1 dag", async () => {
    expect((await pricingOverview(manager)).warnings).toEqual(["noBase"]);
    await createPricingRule(
      manager,
      rule({ minDays: "3", packagePrice: "999", perDayPrice: "333" }),
    );
    expect((await pricingOverview(manager)).warnings).toEqual(["noOneDay"]);
    await createPricingRule(manager, rule());
    const overview = await pricingOverview(manager, fleet.carModel.categoryId);
    expect(overview.warnings).toEqual([]);
    expect(overview.rules.map((r) => r.minDays)).toEqual([1, 3]);
    expect(overview.models).toEqual([
      expect.objectContaining({ id: fleet.carModel.id, name: "Test Model" }),
    ]);
  });

  it("opretter, retter og sletter regler og logger det; nye priser bruges i nye tilbud", async () => {
    await addPrices(fleet);
    const pickupAt = new Date("2027-07-10T08:00:00Z");
    const quoteInput = {
      carModelId: fleet.carModel.id,
      pickupLocationId: fleet.location.id,
      returnLocationId: fleet.location.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: new Date(pickupAt.getTime() + 3 * 86_400_000).toISOString(),
    };
    expect((await getQuote(quoteInput, { now: new Date("2027-01-01") })).subtotalMinor).toBe(99900);

    // Sommerpris for modellen: vinder over kategoriens pris i perioden.
    const summer = await createPricingRule(
      manager,
      rule({
        carModelId: fleet.carModel.id,
        minDays: "3",
        packagePrice: "1.299,00",
        perDayPrice: "433",
        validFrom: "2027-06-01",
        validTo: "2027-08-31",
        priority: "10",
      }),
    );
    // Modelregler erstatter kategoriens trappe for modellen, så modellen skal have en 1-dagspris.
    await createPricingRule(
      manager,
      rule({ carModelId: fleet.carModel.id, packagePrice: "450", perDayPrice: "450" }),
    );
    expect((await getQuote(quoteInput, { now: new Date("2027-01-01") })).subtotalMinor).toBe(
      129900,
    );

    const preview = await pricePreview(manager, {
      carModelId: fleet.carModel.id,
      days: "3",
      date: "2027-07-10",
    });
    expect(preview.price).toMatchObject({ totalMinor: 129900, isPackage: true, ruleId: summer.id });
    const winter = await pricePreview(manager, {
      carModelId: fleet.carModel.id,
      days: "2",
      date: "2027-12-01",
    });
    expect(winter.price).toMatchObject({ totalMinor: 90000, minDays: 1, isPackage: false });

    await updatePricingRule(
      manager,
      summer.id,
      rule({
        carModelId: fleet.carModel.id,
        minDays: "3",
        packagePrice: "1199",
        perDayPrice: "400",
        validFrom: "2027-06-01",
        validTo: "2027-08-31",
        priority: "10",
      }),
    );
    expect(await pricingRule(manager, summer.id)).toMatchObject({
      packageMinor: 119900,
      validFrom: "2027-06-01",
      validTo: "2027-08-31",
    });
    expect((await getQuote(quoteInput, { now: new Date("2027-01-01") })).subtotalMinor).toBe(
      119900,
    );

    await deletePricingRule(manager, summer.id);
    expect(await db.pricingRule.count({ where: { id: summer.id } })).toBe(0);
    const actions = await db.auditLog.findMany({
      where: { entityType: "PricingRule" },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action)).toEqual([
      "pricingRule.create",
      "pricingRule.create",
      "pricingRule.update",
      "pricingRule.delete",
    ]);
  });

  it("afviser ugyldige regler og en model fra en anden kategori", async () => {
    expect(await failure(createPricingRule(manager, rule({ minDays: "0" })))).toMatchObject({
      code: "VALIDATION_FAILED",
      details: { fields: ["minDays"] },
    });
    expect(
      await failure(
        createPricingRule(manager, rule({ validFrom: "2027-09-01", validTo: "2027-08-01" })),
      ),
    ).toMatchObject({ details: { fields: ["validTo"] } });
    expect(
      await failure(createPricingRule(manager, rule({ packagePrice: "12,345" }))),
    ).toMatchObject({
      details: { fields: ["packagePrice"] },
    });
    const other = await db.carCategory.create({ data: { slug: "suv", nameI18n: { da: "SUV" } } });
    expect(
      await failure(
        createPricingRule(manager, rule({ categoryId: other.id, carModelId: fleet.carModel.id })),
      ),
    ).toMatchObject({ details: { fields: ["carModelId"] } });
    expect(await db.pricingRule.count()).toBe(0);
  });

  it("kræver MANAGER", async () => {
    expect((await failure(pricingOverview(staff))).code).toBe("FORBIDDEN");
    expect((await failure(createPricingRule(staff, rule()))).code).toBe("FORBIDDEN");
    const untrusted: PolicyContext = {
      actor: { ...manager.actor!, twoFactorEnabled: false },
    };
    expect((await failure(createPricingRule(untrusted, rule()))).code).toBe("FORBIDDEN");
  });
});

const extra = (overrides: Record<string, string> = {}) => ({
  code: "Child_Seat",
  nameDa: "Barnestol",
  nameEn: "Child seat",
  nameAr: "",
  nameFr: "",
  descriptionDa: "",
  descriptionEn: "",
  descriptionAr: "",
  descriptionFr: "",
  pricing: "PER_DAY",
  price: "75",
  maxPrice: "450",
  maxQuantity: "3",
  stock: "",
  sortOrder: "",
  isActive: "on",
  ...overrides,
});

describe("ekstraudstyr (F8)", () => {
  it("opretter og retter udstyr; kan vælges i et tilbud, til det skjules", async () => {
    const created = await createExtra(manager, extra());
    expect(await adminExtra(manager, created!.id)).toMatchObject({
      code: "child_seat",
      nameI18n: { da: "Barnestol", en: "Child seat" },
      priceMinor: 7500,
      maxPriceMinor: 45000,
      stock: null,
      names: { da: "Barnestol", en: "Child seat", ar: "", fr: "" },
    });
    await addPrices(fleet);
    const quoteInput = {
      carModelId: fleet.carModel.id,
      pickupLocationId: fleet.location.id,
      returnLocationId: fleet.location.id,
      pickupAt: "2027-03-01T08:00:00.000Z",
      returnAt: "2027-03-04T08:00:00.000Z",
      extras: [{ code: "child_seat", quantity: 1 }],
    };
    const quote = await getQuote(quoteInput, { now: new Date("2027-01-01") });
    expect(quote.lines.find((line) => line.code === "child_seat")?.totalMinor).toBe(22500);

    await updateExtra(
      manager,
      created!.id,
      extra({ isActive: "", descriptionDa: "Til børn 9-18 kg" }),
    );
    expect(await adminExtra(manager, created!.id)).toMatchObject({
      isActive: false,
      descriptionI18n: { da: "Til børn 9-18 kg" },
    });
    expect(await failure(getQuote(quoteInput, { now: new Date("2027-01-01") }))).toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("afviser dobbelt kode, loft på pris pr. leje og loft under prisen", async () => {
    await createExtra(manager, extra());
    expect(await failure(createExtra(manager, extra()))).toMatchObject({
      details: { fields: ["code"], reason: "DUPLICATE" },
    });
    expect(
      await failure(createExtra(manager, extra({ code: "gps", pricing: "PER_BOOKING" }))),
    ).toMatchObject({ details: { fields: ["maxPrice"] } });
    expect(
      await failure(createExtra(manager, extra({ code: "gps", maxPrice: "50" }))),
    ).toMatchObject({
      details: { fields: ["maxPrice"] },
    });
    expect(await failure(createExtra(manager, extra({ code: "x", nameDa: "" })))).toMatchObject({
      details: { fields: ["code", "nameDa"] },
    });
  });

  it("udstyr, der har været booket, kan ikke slettes", async () => {
    const used = await createExtra(manager, extra());
    const unused = await createExtra(manager, extra({ code: "gps", nameDa: "GPS" }));
    const booking = await db.booking.create({
      data: bookingData(fleet, fleet.carA.id, "2027-03-01T08:00:00Z", "2027-03-04T08:00:00Z"),
    });
    await db.bookingItem.create({
      data: {
        bookingId: booking.id,
        type: "EXTRA",
        extraId: used!.id,
        labelSnapshot: "Barnestol",
        unitPriceMinor: 7500,
        totalMinor: 22500,
        quantity: 1,
        currency: "DKK",
      },
    });
    expect(await failure(deleteExtra(manager, used!.id))).toMatchObject({
      code: "CONFLICT",
      details: { reason: "IN_USE" },
    });
    await deleteExtra(manager, unused!.id);
    expect((await listExtras(manager)).map((e) => [e.code, e.used])).toEqual([["child_seat", 1]]);
    expect((await failure(listExtras(staff))).code).toBe("FORBIDDEN");
  });
});
