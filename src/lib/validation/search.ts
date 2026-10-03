import { z } from "zod";

/**
 * Søgning og filtre i URL'en (/cars?location=koebenhavn&pickupDate=…). URL'en kan deles og
 * bogmærkes, og formularerne virker uden JavaScript. Ugyldige værdier ignoreres i stedet for at
 * give en fejlside, fordi de typisk kommer fra et gammelt eller redigeret link.
 */
const slug = z
  .string()
  .regex(/^[a-z0-9-]{1,80}$/)
  .optional()
  .catch(undefined);
const date = z.iso.date().optional().catch(undefined);
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .optional()
  .catch(undefined);

export const sortOptions = ["recommended", "price_asc", "price_desc", "popular", "newest"] as const;
export type SortOption = (typeof sortOptions)[number];

export const carSearchSchema = z.object({
  location: slug,
  returnLocation: slug,
  pickupDate: date,
  pickupTime: time,
  returnDate: date,
  returnTime: time,
  category: slug,
  transmission: z.enum(["MANUAL", "AUTOMATIC"]).optional().catch(undefined),
  fuel: z.enum(["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]).optional().catch(undefined),
  seats: z.coerce.number().int().min(2).max(9).optional().catch(undefined),
  sort: z.enum(sortOptions).default("recommended").catch("recommended"),
});

export type CarSearch = z.output<typeof carSearchSchema>;

/** Next.js giver searchParams som string | string[]; første værdi bruges. */
export function parseCarSearch(params: Record<string, string | string[] | undefined>): CarSearch {
  const flat = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return carSearchSchema.parse(flat);
}

/** Er der valgt sted og periode, så der kan søges på ledighed og totalpris? */
export function hasPeriod(search: CarSearch): search is CarSearch & {
  location: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
} {
  return Boolean(
    search.location &&
    search.pickupDate &&
    search.pickupTime &&
    search.returnDate &&
    search.returnTime,
  );
}

/** Kun søgningens sted og periode, til links fra katalog til bil-side og videre til booking. */
export function periodQuery(search: CarSearch): Record<string, string> {
  const keys = [
    "location",
    "returnLocation",
    "pickupDate",
    "pickupTime",
    "returnDate",
    "returnTime",
  ] as const;
  return Object.fromEntries(
    keys.flatMap((key) => (search[key] ? [[key, String(search[key])]] : [])),
  );
}
