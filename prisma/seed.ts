/**
 * Demo-data til udvikling og staging: lokationer, kategorier, bilmodeller,
 * fysiske biler, priser, ekstraudstyr og en rabatkode.
 *
 * Alle navne, adresser, registreringsnumre og stelnumre er fiktive. Scriptet
 * kan køres igen og igen (upsert) og nægter at køre i produktion.
 *
 * Kør: pnpm db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Fuel, type Transmission } from "../src/generated/prisma/client";

if (process.env.APP_ENV === "production") {
  throw new Error("Seed må ikke køre i produktion.");
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type I18n = { da: string; en: string; ar: string; fr: string };
const kr = (amount: number) => Math.round(amount * 100);

// ─── Lokationer ──────────────────────────────────────────────────────────────

const weekdays = [1, 2, 3, 4, 5];
const officeHours = [
  ...weekdays.map((weekday) => ({ weekday, opensAt: "08:00", closesAt: "18:00", closed: false })),
  { weekday: 6, opensAt: "09:00", closesAt: "15:00", closed: false },
  { weekday: 7, opensAt: null, closesAt: null, closed: true },
];
const airportHours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  opensAt: "06:00",
  closesAt: "23:00",
  closed: false,
}));

const locations = [
  {
    slug: "koebenhavn",
    name: "København",
    type: "OFFICE" as const,
    address: "Eksempelvej 1",
    postalCode: "1620",
    city: "København V",
    lat: 55.6727,
    lng: 12.5545,
    deliveryEnabled: true,
    hours: officeHours,
    zones: [
      { maxDistanceKm: 10, feeMinor: kr(199) },
      { maxDistanceKm: 25, feeMinor: kr(349) },
    ],
  },
  {
    slug: "koebenhavns-lufthavn",
    name: "Københavns Lufthavn",
    type: "AIRPORT" as const,
    address: "Eksempelvej 2",
    postalCode: "2770",
    city: "Kastrup",
    lat: 55.6181,
    lng: 12.6561,
    deliveryEnabled: false,
    hours: airportHours,
    zones: [],
  },
  {
    slug: "aarhus",
    name: "Aarhus",
    type: "OFFICE" as const,
    address: "Eksempelvej 3",
    postalCode: "8000",
    city: "Aarhus C",
    lat: 56.1496,
    lng: 10.2045,
    deliveryEnabled: true,
    hours: officeHours,
    zones: [{ maxDistanceKm: 15, feeMinor: kr(249) }],
  },
  {
    slug: "odense",
    name: "Odense",
    type: "OFFICE" as const,
    address: "Eksempelvej 4",
    postalCode: "5000",
    city: "Odense C",
    lat: 55.4038,
    lng: 10.4024,
    deliveryEnabled: false,
    hours: officeHours,
    zones: [],
  },
];

// ─── Kategorier og priser ────────────────────────────────────────────────────

// Pakkepriser i kr. for 1, 3, 7 og 30 dage. Economy er eksemplet fra kravspecifikationen §8.
const categories: { slug: string; name: I18n; packages: [number, number, number, number] }[] = [
  {
    slug: "economy",
    name: { da: "Economy", en: "Economy", ar: "اقتصادية", fr: "Économique" },
    packages: [399, 999, 1999, 6999],
  },
  {
    slug: "compact",
    name: { da: "Mellemklasse", en: "Compact", ar: "متوسطة", fr: "Compacte" },
    packages: [449, 1199, 2399, 7999],
  },
  {
    slug: "family",
    name: { da: "Familie", en: "Family", ar: "عائلية", fr: "Familiale" },
    packages: [599, 1599, 3199, 10999],
  },
  {
    slug: "suv",
    name: { da: "SUV", en: "SUV", ar: "دفع رباعي", fr: "SUV" },
    packages: [749, 1999, 3999, 13999],
  },
  {
    slug: "electric",
    name: { da: "Elbil", en: "Electric", ar: "كهربائية", fr: "Électrique" },
    packages: [549, 1499, 2999, 9999],
  },
  {
    slug: "luxury",
    name: { da: "Luksus", en: "Luxury", ar: "فاخرة", fr: "Luxe" },
    packages: [1299, 3499, 6999, 23999],
  },
];
const tierDays = [1, 3, 7, 30] as const;

// ─── Bilmodeller og biler ────────────────────────────────────────────────────

type ModelSeed = {
  slug: string;
  category: string;
  brand: string;
  model: string;
  year: number;
  transmission: Transmission;
  fuel: Fuel;
  seats: number;
  bags: number;
  doors: number;
  deposit: number;
  featured?: boolean;
  popularity: number;
  description: I18n;
  /** Lokationer og antal biler af modellen. */
  fleet: Record<string, number>;
};

const models: ModelSeed[] = [
  {
    slug: "toyota-aygo-x",
    category: "economy",
    brand: "Toyota",
    model: "Aygo X",
    year: 2024,
    transmission: "MANUAL",
    fuel: "PETROL",
    seats: 4,
    bags: 1,
    doors: 5,
    deposit: 3000,
    popularity: 70,
    description: {
      da: "Lille og økonomisk bybil, nem at parkere.",
      en: "Small, economical city car that is easy to park.",
      ar: "سيارة مدينة صغيرة واقتصادية وسهلة الركن.",
      fr: "Petite citadine économique, facile à garer.",
    },
    fleet: { koebenhavn: 2, aarhus: 1 },
  },
  {
    slug: "kia-picanto-automatic",
    category: "economy",
    brand: "Kia",
    model: "Picanto",
    year: 2024,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    seats: 4,
    bags: 1,
    doors: 5,
    deposit: 3000,
    popularity: 60,
    description: {
      da: "Bybil med automatgear.",
      en: "City car with automatic transmission.",
      ar: "سيارة مدينة بناقل حركة أوتوماتيكي.",
      fr: "Citadine à boîte automatique.",
    },
    fleet: { koebenhavn: 1, "koebenhavns-lufthavn": 1 },
  },
  {
    slug: "volkswagen-golf",
    category: "compact",
    brand: "Volkswagen",
    model: "Golf",
    year: 2024,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    seats: 5,
    bags: 2,
    doors: 5,
    deposit: 4000,
    popularity: 80,
    featured: true,
    description: {
      da: "Komfortabel allround-bil til by og motorvej.",
      en: "Comfortable all-rounder for city and motorway.",
      ar: "سيارة مريحة متعددة الاستخدامات للمدينة والطريق السريع.",
      fr: "Polyvalente et confortable, en ville comme sur autoroute.",
    },
    fleet: { koebenhavn: 1, "koebenhavns-lufthavn": 1, odense: 1 },
  },
  {
    slug: "toyota-corolla-hybrid",
    category: "compact",
    brand: "Toyota",
    model: "Corolla Hybrid",
    year: 2025,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    seats: 5,
    bags: 3,
    doors: 5,
    deposit: 4000,
    popularity: 95,
    featured: true,
    description: {
      da: "Lavt forbrug, automatgear og plads til bagagen.",
      en: "Low fuel use, automatic and room for luggage.",
      ar: "استهلاك منخفض وناقل أوتوماتيكي ومساحة للأمتعة.",
      fr: "Faible consommation, boîte automatique et de la place pour les bagages.",
    },
    fleet: { koebenhavn: 2, "koebenhavns-lufthavn": 2, aarhus: 1 },
  },
  {
    slug: "skoda-octavia-combi",
    category: "family",
    brand: "Škoda",
    model: "Octavia Combi",
    year: 2024,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    seats: 5,
    bags: 4,
    doors: 5,
    deposit: 5000,
    popularity: 75,
    description: {
      da: "Rummelig stationcar til familien og ferien.",
      en: "Spacious estate for family trips and holidays.",
      ar: "سيارة واسعة للعائلة والعطلات.",
      fr: "Break spacieux pour la famille et les vacances.",
    },
    fleet: { koebenhavn: 1, aarhus: 1, odense: 1 },
  },
  {
    slug: "volkswagen-touran-7",
    category: "family",
    brand: "Volkswagen",
    model: "Touran (7 sæder)",
    year: 2023,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    seats: 7,
    bags: 3,
    doors: 5,
    deposit: 5000,
    popularity: 55,
    description: {
      da: "Syv sæder til den store familie.",
      en: "Seven seats for the big family.",
      ar: "سبعة مقاعد للعائلة الكبيرة.",
      fr: "Sept places pour les grandes familles.",
    },
    fleet: { koebenhavn: 1 },
  },
  {
    slug: "toyota-rav4-hybrid",
    category: "suv",
    brand: "Toyota",
    model: "RAV4 Hybrid",
    year: 2025,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    seats: 5,
    bags: 4,
    doors: 5,
    deposit: 6000,
    popularity: 90,
    featured: true,
    description: {
      da: "Høj siddestilling, firehjulstræk og masser af plads.",
      en: "High seating position, all-wheel drive and plenty of space.",
      ar: "وضعية جلوس مرتفعة ودفع رباعي ومساحة واسعة.",
      fr: "Position de conduite haute, transmission intégrale et beaucoup d'espace.",
    },
    fleet: { koebenhavn: 1, "koebenhavns-lufthavn": 1, aarhus: 1 },
  },
  {
    slug: "volvo-xc60",
    category: "suv",
    brand: "Volvo",
    model: "XC60",
    year: 2024,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    seats: 5,
    bags: 4,
    doors: 5,
    deposit: 8000,
    popularity: 65,
    description: {
      da: "Skandinavisk premium-SUV med høj sikkerhed.",
      en: "Scandinavian premium SUV with high safety.",
      ar: "سيارة دفع رباعي اسكندنافية فاخرة بمستوى أمان عالٍ.",
      fr: "SUV premium scandinave, très sûr.",
    },
    fleet: { "koebenhavns-lufthavn": 1 },
  },
  {
    slug: "tesla-model-3",
    category: "electric",
    brand: "Tesla",
    model: "Model 3",
    year: 2025,
    transmission: "AUTOMATIC",
    fuel: "ELECTRIC",
    seats: 5,
    bags: 3,
    doors: 4,
    deposit: 6000,
    popularity: 85,
    featured: true,
    description: {
      da: "Elbil med lang rækkevidde og adgang til hurtigladere.",
      en: "Long-range electric car with fast-charger access.",
      ar: "سيارة كهربائية بمدى طويل وإمكانية الشحن السريع.",
      fr: "Voiture électrique à grande autonomie, accès aux recharges rapides.",
    },
    fleet: { koebenhavn: 1, "koebenhavns-lufthavn": 1 },
  },
  {
    slug: "volkswagen-id4",
    category: "electric",
    brand: "Volkswagen",
    model: "ID.4",
    year: 2024,
    transmission: "AUTOMATIC",
    fuel: "ELECTRIC",
    seats: 5,
    bags: 4,
    doors: 5,
    deposit: 6000,
    popularity: 50,
    description: {
      da: "Rummelig elektrisk SUV.",
      en: "Spacious electric SUV.",
      ar: "سيارة دفع رباعي كهربائية واسعة.",
      fr: "SUV électrique spacieux.",
    },
    fleet: { aarhus: 1, odense: 1 },
  },
  {
    slug: "mercedes-benz-e-class",
    category: "luxury",
    brand: "Mercedes-Benz",
    model: "E-Klasse",
    year: 2025,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    seats: 5,
    bags: 3,
    doors: 4,
    deposit: 15000,
    popularity: 40,
    description: {
      da: "Komfort og stil til forretningsrejsen.",
      en: "Comfort and style for business travel.",
      ar: "الراحة والأناقة لرحلات العمل.",
      fr: "Confort et élégance pour les voyages d'affaires.",
    },
    fleet: { "koebenhavns-lufthavn": 1 },
  },
];

// ─── Ekstraudstyr ────────────────────────────────────────────────────────────

// Levering og afhentning er ikke ekstraudstyr, men prissættes af leveringszonerne.
const extras = [
  {
    code: "child_seat",
    pricing: "PER_DAY" as const,
    price: 75,
    max: 450,
    maxQuantity: 3,
    stock: 10,
    name: { da: "Barnestol", en: "Child seat", ar: "مقعد أطفال", fr: "Siège enfant" },
  },
  {
    code: "booster",
    pricing: "PER_DAY" as const,
    price: 50,
    max: 300,
    maxQuantity: 3,
    stock: 10,
    name: { da: "Selepude", en: "Booster seat", ar: "مقعد معزز", fr: "Rehausseur" },
  },
  {
    code: "extra_driver",
    pricing: "PER_DAY" as const,
    price: 99,
    max: 599,
    maxQuantity: 2,
    stock: null,
    name: {
      da: "Ekstra fører",
      en: "Additional driver",
      ar: "سائق إضافي",
      fr: "Conducteur supplémentaire",
    },
  },
  {
    code: "gps",
    pricing: "PER_DAY" as const,
    price: 69,
    max: 399,
    maxQuantity: 1,
    stock: 8,
    name: { da: "GPS", en: "GPS", ar: "نظام تحديد المواقع", fr: "GPS" },
  },
  {
    code: "wifi",
    pricing: "PER_DAY" as const,
    price: 79,
    max: 499,
    maxQuantity: 1,
    stock: 6,
    name: { da: "Mobilt Wi-Fi", en: "Mobile Wi-Fi", ar: "واي فاي متنقل", fr: "Wi-Fi mobile" },
  },
  {
    code: "extra_km_100",
    pricing: "PER_BOOKING" as const,
    price: 199,
    max: null,
    maxQuantity: 10,
    stock: null,
    name: {
      da: "100 ekstra km",
      en: "100 extra km",
      ar: "100 كم إضافية",
      fr: "100 km supplémentaires",
    },
  },
  {
    code: "airport_service",
    pricing: "PER_BOOKING" as const,
    price: 149,
    max: null,
    maxQuantity: 1,
    stock: null,
    name: {
      da: "Lufthavnsservice (møder dig i ankomsthallen)",
      en: "Airport meet & greet",
      ar: "خدمة المطار (نلتقي بك في صالة الوصول)",
      fr: "Accueil à l'aéroport",
    },
  },
];

async function main() {
  // Lokationer
  const locationIds: Record<string, string> = {};
  for (const { hours, zones, ...data } of locations) {
    const location = await db.location.upsert({
      where: { slug: data.slug },
      create: data,
      update: data,
    });
    locationIds[data.slug] = location.id;
    await db.$transaction([
      db.openingHours.deleteMany({ where: { locationId: location.id } }),
      db.openingHours.createMany({ data: hours.map((h) => ({ ...h, locationId: location.id })) }),
      db.deliveryZone.deleteMany({ where: { locationId: location.id } }),
      db.deliveryZone.createMany({ data: zones.map((z) => ({ ...z, locationId: location.id })) }),
    ]);
  }

  // Kategorier og standardpriser
  const categoryIds: Record<string, string> = {};
  for (const [index, category] of categories.entries()) {
    const row = await db.carCategory.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, nameI18n: category.name, sortOrder: index },
      update: { nameI18n: category.name, sortOrder: index },
    });
    categoryIds[category.slug] = row.id;
    await db.$transaction([
      db.pricingRule.deleteMany({ where: { categoryId: row.id, carModelId: null } }),
      db.pricingRule.createMany({
        data: tierDays.map((minDays, tier) => ({
          categoryId: row.id,
          minDays,
          packageMinor: kr(category.packages[tier]!),
          perDayMinor: Math.round(kr(category.packages[tier]!) / minDays),
        })),
      }),
    ]);
  }

  // Bilmodeller og fysiske biler
  let carNumber = 0;
  for (const { fleet, category, deposit, featured, popularity, description, ...data } of models) {
    const modelData = {
      ...data,
      categoryId: categoryIds[category]!,
      includedKmPerDay: 200,
      extraKmFeeMinor: kr(2.5),
      depositMinor: kr(deposit),
      isFeatured: featured ?? false,
      popularityScore: popularity,
      descriptionI18n: description,
    };
    const carModel = await db.carModel.upsert({
      where: { slug: data.slug },
      create: modelData,
      update: modelData,
    });

    for (const [locationSlug, count] of Object.entries(fleet)) {
      for (let i = 0; i < count; i++) {
        carNumber++;
        const serial = String(carNumber).padStart(3, "0");
        // Fiktive numre: "DE" står for demo.
        const registrationNumber = `DE 10 ${serial}`;
        const carData = {
          carModelId: carModel.id,
          homeLocationId: locationIds[locationSlug]!,
          vin: `DEMO000000000${serial}`.padEnd(17, "0"),
          odometerKm: 5000 + carNumber * 1371,
          color: ["Hvid", "Sort", "Grå", "Blå"][carNumber % 4],
          purchaseDate: new Date("2024-03-01"),
          nextInspectionDue: new Date("2027-03-01"),
          nextServiceDue: new Date("2027-01-15"),
          nextServiceKm: 30000,
          tyreType: "Helår",
        };
        await db.car.upsert({
          where: { registrationNumber },
          create: { registrationNumber, ...carData },
          update: carData,
        });
      }
    }
  }

  // Ekstraudstyr
  for (const [index, extra] of extras.entries()) {
    const data = {
      nameI18n: extra.name,
      pricing: extra.pricing,
      priceMinor: kr(extra.price),
      maxPriceMinor: extra.max === null ? null : kr(extra.max),
      maxQuantity: extra.maxQuantity,
      stock: extra.stock,
      sortOrder: index,
    };
    await db.extra.upsert({
      where: { code: extra.code },
      create: { code: extra.code, ...data },
      update: data,
    });
  }

  // Rabatkode
  await db.discount.upsert({
    where: { code: "VELKOMMEN10" },
    create: { code: "VELKOMMEN10", type: "PERCENT", value: 10, maxUsesPerCustomer: 1 },
    update: {},
  });

  // Administrator (password sættes, når login bygges i M3)
  await db.user.upsert({
    where: { email: "admin@example.com" },
    create: {
      email: "admin@example.com",
      name: "Demo Admin",
      role: "SUPER_ADMIN",
      emailVerified: true,
    },
    update: { role: "SUPER_ADMIN" },
  });

  const counts = {
    locations: await db.location.count(),
    categories: await db.carCategory.count(),
    carModels: await db.carModel.count(),
    cars: await db.car.count(),
    pricingRules: await db.pricingRule.count(),
    extras: await db.extra.count(),
  };
  console.log("Seed færdig:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
