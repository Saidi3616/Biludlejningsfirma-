import { site } from "@/config/site";
import { absoluteUrl, schemaPrice, siteUrl } from "@/lib/seo";

/**
 * Strukturerede data (schema.org, M16) til Googles rich results. Rene funktioner: siderne
 * henter data via services og sender dem hertil. Test: tests/unit/structured-data.test.ts.
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Virksomheden som helhed (forsiden). */
export function organizationJsonLd() {
  return {
    "@type": "AutoRental",
    "@id": `${siteUrl()}/#organization`,
    name: site.name,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icons/icon-512.png"),
    telephone: site.phone,
    email: site.email,
  };
}

type CarForSchema = {
  name: string;
  brand: string;
  year: number;
  description: string;
  seats: number;
  doors: number;
  transmission: "MANUAL" | "AUTOMATIC";
  fuel: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC";
  fromPerDayMinor: number;
  currency: string;
  image: { url: string } | null;
};

const fuelTypes: Record<CarForSchema["fuel"], string> = {
  PETROL: "Gasoline",
  DIESEL: "Diesel",
  HYBRID: "Hybrid",
  ELECTRIC: "Electricity",
};

/** Bil-siden: en lejebil (Product + Car) med dagsprisen som tilbud. */
export function carJsonLd(car: CarForSchema, pageUrl: string) {
  const price = schemaPrice(car.fromPerDayMinor);
  return {
    "@type": ["Product", "Car"],
    name: car.name,
    brand: { "@type": "Brand", name: car.brand },
    vehicleModelDate: String(car.year),
    ...(car.description ? { description: car.description } : {}),
    ...(car.image ? { image: absoluteUrl(car.image.url) } : {}),
    url: pageUrl,
    seatingCapacity: car.seats,
    numberOfDoors: car.doors,
    vehicleTransmission: car.transmission === "AUTOMATIC" ? "Automatic" : "Manual",
    fuelType: fuelTypes[car.fuel],
    offers: {
      "@type": "Offer",
      url: pageUrl,
      price,
      priceCurrency: car.currency,
      availability: "https://schema.org/InStock",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      seller: { "@id": `${siteUrl()}/#organization` },
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: car.currency,
        unitCode: "DAY",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "DAY" },
      },
    },
  };
}

type LocationForSchema = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  lat: { toString(): string };
  lng: { toString(): string };
  phone: string | null;
  email: string | null;
  openingHours: {
    weekday: number | null;
    specialDate: Date | null;
    opensAt: string | null;
    closesAt: string | null;
    closed: boolean;
  }[];
};

/** Lokationssiden: en lokal forretning med adresse, kort og åbningstider. */
export function locationJsonLd(location: LocationForSchema, pageUrl: string) {
  const weekly = location.openingHours.filter(
    (row) => row.specialDate === null && row.weekday !== null && !row.closed,
  );
  const hours = weekly
    .filter((row) => row.opensAt && row.closesAt && row.weekday! >= 1 && row.weekday! <= 7)
    .sort((a, b) => a.weekday! - b.weekday! || a.opensAt!.localeCompare(b.opensAt!))
    .map((row) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${DAYS[row.weekday! - 1]}`,
      opens: row.opensAt,
      closes: row.closesAt,
    }));
  return {
    "@type": "AutoRental",
    "@id": `${pageUrl}#location`,
    name: `${site.name} – ${location.name}`,
    url: pageUrl,
    image: absoluteUrl("/icons/icon-512.png"),
    telephone: location.phone ?? site.phone,
    email: location.email ?? site.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: location.address,
      postalCode: location.postalCode,
      addressLocality: location.city,
      addressCountry: location.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: Number(location.lat.toString()),
      longitude: Number(location.lng.toString()),
    },
    ...(hours.length > 0 ? { openingHoursSpecification: hours } : {}),
    parentOrganization: { "@id": `${siteUrl()}/#organization` },
  };
}

/** FAQ-siden: spørgsmål og svar. */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
