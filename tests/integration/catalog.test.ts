import { beforeEach, describe, expect, it } from "vitest";
import { carSearchSchema, parseCarSearch } from "@/lib/validation/search";
import {
  carAvailability,
  findCars,
  getCar,
  pricingOverview,
  sitemapSlugs,
} from "@/server/catalog/service";
import { submitContactMessage } from "@/server/contact/service";
import { db } from "@/server/db";
import { addPrices, bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;

const now = new Date("2026-05-01T08:00:00Z");
const ctx = { locale: "da", now };
const period = {
  location: "test",
  pickupDate: "2026-06-01",
  pickupTime: "10:00",
  returnDate: "2026-06-04",
  returnTime: "10:00",
};

/** En elbil med automatgear i sin egen kategori, uden biler på lager. */
async function addElectric(options: { cars?: number } = {}) {
  const category = await db.carCategory.create({
    data: { slug: "electric", nameI18n: { da: "Elbil", en: "Electric" } },
  });
  const model = await db.carModel.create({
    data: {
      categoryId: category.id,
      slug: "tesla-model-3",
      brand: "Tesla",
      model: "Model 3",
      year: 2026,
      transmission: "AUTOMATIC",
      fuel: "ELECTRIC",
      seats: 5,
      bags: 3,
      doors: 4,
      includedKmPerDay: 300,
      extraKmFeeMinor: 300,
      depositMinor: 500000,
      popularityScore: 99,
      descriptionI18n: { da: "Elbil", en: "Electric car" },
    },
  });
  await db.pricingRule.create({
    data: { categoryId: category.id, minDays: 1, packageMinor: 59900, perDayMinor: 59900 },
  });
  for (let i = 0; i < (options.cars ?? 1); i++) {
    await db.car.create({
      data: {
        carModelId: model.id,
        homeLocationId: fleet.location.id,
        registrationNumber: `EL 00 00${i}`,
        vin: `ELEC00000000000${i}0`,
        odometerKm: 100,
      },
    });
  }
  return model;
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  await addPrices(fleet);
});

describe("søgeparametre i URL'en", () => {
  it("ugyldige værdier ignoreres i stedet for at give en fejl", () => {
    const search = parseCarSearch({
      location: "Ikke Et Slug!",
      pickupDate: "2026-13-45",
      pickupTime: "25:00",
      seats: "100",
      sort: "billigst",
      fuel: ["ELECTRIC", "PETROL"],
    });
    expect(search).toEqual({ sort: "recommended", fuel: "ELECTRIC" });
    expect(carSearchSchema.parse({ seats: "5" }).seats).toBe(5);
  });
});

describe("katalog", () => {
  it("uden periode: alle modeller med pris pr. dag, anbefalede først", async () => {
    const tesla = await addElectric();
    const result = await findCars(parseCarSearch({}), ctx);
    expect(result.mode).toBe("browse");
    expect(result.cars.map((car) => [car.slug, car.fromPerDayMinor])).toEqual([
      [tesla.slug, 59900],
      [fleet.carModel.slug, 39900],
    ]);
    expect(result.cars[0]).toMatchObject({ categoryName: "Elbil", description: "Elbil" });
  });

  it("filtre og sortering", async () => {
    await addElectric();
    const electric = await findCars(parseCarSearch({ fuel: "ELECTRIC" }), ctx);
    expect(electric.cars.map((car) => car.slug)).toEqual(["tesla-model-3"]);
    const cheapest = await findCars(parseCarSearch({ sort: "price_asc" }), ctx);
    expect(cheapest.cars[0]?.slug).toBe(fleet.carModel.slug);
    const big = await findCars(parseCarSearch({ seats: "7" }), ctx);
    expect(big.cars).toEqual([]);
  });

  it("modeller uden pris vises ikke", async () => {
    await db.pricingRule.deleteMany();
    expect((await findCars(parseCarSearch({}), ctx)).cars).toEqual([]);
  });

  it("med sted og periode: kun ledige modeller med totalpris", async () => {
    await addElectric();
    const tesla = await db.car.findFirstOrThrow({ where: { carModel: { slug: "tesla-model-3" } } });
    await db.booking.create({
      data: {
        ...bookingData(fleet, tesla.id, "2026-06-02T08:00:00Z", "2026-06-03T08:00:00Z"),
        carModelId: tesla.carModelId,
      },
    });
    const result = await findCars(parseCarSearch(period), ctx);
    expect(result.mode).toBe("search");
    if (result.mode !== "search") return;
    expect(result.rentalDays).toBe(3);
    expect(result.cars.map((car) => [car.slug, car.quote.totalMinor, car.freeCars])).toEqual([
      [fleet.carModel.slug, 99900, 2],
    ]);
  });

  it("en periode, der ikke kan bookes, giver en forklaring og viser alle biler", async () => {
    const result = await findCars(
      parseCarSearch({ ...period, returnDate: "2026-06-01", returnTime: "09:00" }),
      ctx,
    );
    expect(result.mode).toBe("error");
    if (result.mode !== "error") return;
    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.cars).toHaveLength(1);
  });

  it("ukendt sted behandles som ingen søgning", async () => {
    const result = await findCars(parseCarSearch({ ...period, location: "findes-ikke" }), ctx);
    expect(result.mode).toBe("browse");
  });
});

describe("bil-side", () => {
  it("pristrappe, lokationer og ledighed med pris", async () => {
    const car = await getCar(fleet.carModel.slug, ctx);
    expect(car?.tiers.map((tier) => tier.minDays)).toEqual([1, 3, 7]);
    expect(car?.locations).toEqual([{ slug: "test", name: "Test" }]);

    const available = await carAvailability(car!, parseCarSearch(period), ctx);
    expect(available).toMatchObject({ status: "available", freeCars: 2 });
    if (available.status === "available") expect(available.quote.totalMinor).toBe(99900);

    expect(await carAvailability(car!, parseCarSearch({}), ctx)).toEqual({ status: "none" });
  });

  it("optaget: næste ledige perioder og alternativer", async () => {
    await addElectric();
    for (const id of [fleet.carA.id, fleet.carB.id]) {
      await db.booking.create({
        data: bookingData(fleet, id, "2026-06-01T06:00:00Z", "2026-06-04T10:00:00Z"),
      });
    }
    const car = await getCar(fleet.carModel.slug, ctx);
    const result = await carAvailability(car!, parseCarSearch(period), ctx);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.nextAvailable[0]?.pickupAt.toISOString()).toBe("2026-06-05T08:00:00.000Z");
    expect(result.alternatives.map((alternative) => alternative.car.slug)).toEqual([
      "tesla-model-3",
    ]);
  });

  it("inaktive eller ukendte modeller findes ikke", async () => {
    await db.carModel.update({ where: { id: fleet.carModel.id }, data: { isActive: false } });
    expect(await getCar(fleet.carModel.slug, ctx)).toBeNull();
    expect(await getCar("findes-ikke", ctx)).toBeNull();
  });
});

describe("prisside", () => {
  it("kategoriernes priser, ekstraudstyr og gebyrer", async () => {
    await db.extra.create({
      data: {
        code: "gps",
        nameI18n: { da: "GPS", en: "Sat nav" },
        pricing: "PER_DAY",
        priceMinor: 5000,
        maxPriceMinor: 35000,
      },
    });
    await db.location.update({
      where: { id: fleet.location.id },
      data: { oneWayFeeMinor: 75000 },
    });
    const overview = await pricingOverview("en", now);
    expect(overview.categories).toMatchObject([
      { slug: "economy", tiers: [{ minDays: 1 }, { minDays: 3 }, { minDays: 7 }] },
    ]);
    expect(overview.extras).toMatchObject([{ code: "gps", name: "Sat nav", maxPriceMinor: 35000 }]);
    expect(overview.locations[0]).toMatchObject({ oneWayFeeMinor: 75000 });
  });
});

describe("kontaktformular", () => {
  const message = {
    name: "Mette",
    email: "Mette@Example.com",
    phone: "",
    subject: "",
    message: "Har I autostole til børn?",
  };

  it("gemmer henvendelsen", async () => {
    await submitContactMessage(message, { ip: "198.51.100.1" });
    const saved = await db.message.findFirstOrThrow();
    expect(saved).toMatchObject({
      channel: "CONTACT_FORM",
      direction: "INBOUND",
      email: "mette@example.com",
      phone: null,
      subject: null,
      status: "NEW",
    });
  });

  it("afviser ugyldige felter", async () => {
    await expect(
      submitContactMessage({ ...message, email: "x", message: "kort" }, { ip: "198.51.100.2" }),
    ).rejects.toMatchObject({ details: { fields: ["email", "message"] } });
  });

  it("robotter (skjult felt udfyldt) får et ok, men intet gemmes", async () => {
    expect(
      await submitContactMessage({ ...message, website: "spam.example" }, { ip: "198.51.100.3" }),
    ).toBeNull();
    expect(await db.message.count()).toBe(0);
  });

  it("højst 5 beskeder pr. IP i timen", async () => {
    for (let i = 0; i < 5; i++) await submitContactMessage(message, { ip: "198.51.100.4", now });
    await expect(submitContactMessage(message, { ip: "198.51.100.4", now })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    // En anden IP og en time senere er ikke ramt.
    await submitContactMessage(message, { ip: "198.51.100.5", now });
    await submitContactMessage(message, {
      ip: "198.51.100.4",
      now: new Date(now.getTime() + 61 * 60_000),
    });
    expect(await db.message.count()).toBe(7);
  });
});

describe("sitemap (M16)", () => {
  it("kun biler med pris og aktive lokationer", async () => {
    // Elbilen har en pris; en model uden pris og en lukket lokation udelades.
    await addElectric();
    const noPrice = await db.carCategory.create({ data: { slug: "van", nameI18n: { da: "Van" } } });
    await db.carModel.create({
      data: {
        categoryId: noPrice.id,
        slug: "uden-pris",
        brand: "Ford",
        model: "Transit",
        year: 2024,
        transmission: "MANUAL",
        fuel: "DIESEL",
        seats: 3,
        bags: 6,
        doors: 4,
        includedKmPerDay: 100,
        extraKmFeeMinor: 300,
        depositMinor: 500000,
      },
    });
    await db.location.create({
      data: {
        slug: "lukket",
        name: "Lukket",
        address: "Vej 1",
        postalCode: "2000",
        city: "Frederiksberg",
        lat: 55.68,
        lng: 12.53,
        isActive: false,
      },
    });
    const slugs = await sitemapSlugs(now);
    expect(slugs.cars.map((car) => car.slug)).toEqual(["tesla-model-3", "test-model"]);
    expect(slugs.locations.map((location) => location.slug)).toEqual(["test"]);
    expect(slugs.cars[0]!.updatedAt).toBeInstanceOf(Date);
  });
});
