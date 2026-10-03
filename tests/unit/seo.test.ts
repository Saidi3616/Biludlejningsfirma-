import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absoluteUrl,
  jsonLd,
  languageAlternates,
  pageMetadata,
  schemaPrice,
  siteUrl,
} from "@/lib/seo";
import { carJsonLd, faqJsonLd, locationJsonLd, organizationJsonLd } from "@/lib/structured-data";

afterEach(() => vi.unstubAllEnvs());

describe("sitets adresse", () => {
  it("bruger AUTH_URL uden afsluttende skråstreg", () => {
    vi.stubEnv("AUTH_URL", "https://www.example.dk/");
    expect(siteUrl()).toBe("https://www.example.dk");
    expect(absoluteUrl("/en/cars")).toBe("https://www.example.dk/en/cars");
  });

  it("falder tilbage til localhost lokalt", () => {
    vi.stubEnv("AUTH_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("canonical og hreflang (K11)", () => {
  it("dansk uden præfiks, øvrige med, og x-default er dansk", () => {
    vi.stubEnv("AUTH_URL", "https://www.example.dk");
    expect(languageAlternates("/cars")).toEqual({
      da: "https://www.example.dk/cars",
      en: "https://www.example.dk/en/cars",
      ar: "https://www.example.dk/ar/cars",
      fr: "https://www.example.dk/fr/cars",
      "x-default": "https://www.example.dk/cars",
    });
  });

  it("siden peger på sig selv som canonical og har Open Graph på sit sprog", () => {
    vi.stubEnv("AUTH_URL", "https://www.example.dk");
    const metadata = pageMetadata("fr", "/faq", { title: "FAQ", description: "Questions" });
    expect(metadata.title).toBe("FAQ");
    expect(metadata.alternates?.canonical).toBe("https://www.example.dk/fr/faq");
    expect(metadata.openGraph).toMatchObject({
      url: "https://www.example.dk/fr/faq",
      locale: "fr_FR",
      title: "FAQ",
      images: [{ url: "/fr/opengraph-image", width: 1200, height: 630 }],
    });
  });

  it("bilens foto bruges som delingsbillede, når der er et", () => {
    const metadata = pageMetadata("da", "/cars/x", { image: { url: "/media/x.jpg", alt: "X" } });
    expect(metadata.openGraph?.images).toEqual([{ url: "/media/x.jpg", alt: "X" }]);
    expect(metadata).not.toHaveProperty("title");
  });
});

describe("JSON-LD", () => {
  it("priser skrives som decimaltal uden flydende tal", () => {
    expect(schemaPrice(39900)).toBe("399.00");
    expect(schemaPrice(5)).toBe("0.05");
    expect(schemaPrice(-1250)).toBe("-12.50");
    expect(() => schemaPrice(1.5)).toThrow();
  });

  it("tekst fra databasen kan ikke lukke script-tagget", () => {
    const html = jsonLd({ "@type": "Thing", name: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("<");
    expect(JSON.parse(html)).toMatchObject({ "@context": "https://schema.org" });
  });

  it("bil: Product + Car med dagspris", () => {
    vi.stubEnv("AUTH_URL", "https://www.example.dk");
    const data = carJsonLd(
      {
        name: "Kia Picanto",
        brand: "Kia",
        year: 2024,
        description: "",
        seats: 4,
        doors: 5,
        transmission: "AUTOMATIC",
        fuel: "ELECTRIC",
        fromPerDayMinor: 39900,
        currency: "DKK",
        image: { url: "/media/models/kia.jpg" },
      },
      "https://www.example.dk/cars/kia",
    );
    expect(data).toMatchObject({
      "@type": ["Product", "Car"],
      image: "https://www.example.dk/media/models/kia.jpg",
      vehicleTransmission: "Automatic",
      fuelType: "Electricity",
      offers: { price: "399.00", priceCurrency: "DKK" },
    });
    expect(data).not.toHaveProperty("description");
  });

  it("lokation: adresse, koordinater og kun ugentlige åbne tider i ugedagsorden", () => {
    vi.stubEnv("AUTH_URL", "https://www.example.dk");
    const row = { specialDate: null, closed: false };
    const data = locationJsonLd(
      {
        name: "Aarhus",
        address: "Eksempelvej 3",
        postalCode: "8000",
        city: "Aarhus C",
        country: "DK",
        lat: { toString: () => "56.149600" },
        lng: { toString: () => "10.204500" },
        phone: null,
        email: "aarhus@example.com",
        openingHours: [
          { ...row, weekday: 6, opensAt: "09:00", closesAt: "15:00" },
          { ...row, weekday: 1, opensAt: "08:00", closesAt: "18:00" },
          { ...row, weekday: 7, opensAt: null, closesAt: null, closed: true },
          { ...row, weekday: null, specialDate: new Date(), opensAt: "10:00", closesAt: "12:00" },
        ],
      },
      "https://www.example.dk/locations/aarhus",
      { phone: "+45 11 22 33 44", email: "kontakt@example.dk" },
    );
    expect(data).toMatchObject({
      "@type": "AutoRental",
      email: "aarhus@example.com",
      telephone: "+45 11 22 33 44",
      address: { postalCode: "8000", addressCountry: "DK" },
      geo: { latitude: 56.1496, longitude: 10.2045 },
    });
    expect(data.openingHoursSpecification?.map((spec) => spec.dayOfWeek)).toEqual([
      "https://schema.org/Monday",
      "https://schema.org/Saturday",
    ]);
  });

  it("FAQ og virksomhed", () => {
    expect(faqJsonLd([{ q: "Spørgsmål?", a: "Svar." }])).toEqual({
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Spørgsmål?",
          acceptedAnswer: { "@type": "Answer", text: "Svar." },
        },
      ],
    });
    expect(
      organizationJsonLd({ phone: "+45 11 22 33 44", email: "kontakt@example.dk" }),
    ).toMatchObject({ "@type": "AutoRental", telephone: "+45 11 22 33 44" });
  });
});
