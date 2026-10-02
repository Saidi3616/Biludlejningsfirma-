import { z } from "zod";

/** Højst et år ad gangen, så forespørgslerne holder sig små. */
export const MAX_STATS_DAYS = 366;

const DAY_MS = 86_400_000;

/** Periodefilter til statistik (F: /admin/statistics). Datoerne er inklusive. */
export const statsQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    location: z
      .union([z.uuid(), z.literal("")])
      .optional()
      .transform((value) => value || null),
  })
  .superRefine((value, ctx) => {
    const days = (Date.parse(value.to) - Date.parse(value.from)) / DAY_MS + 1;
    if (days < 1 || days > MAX_STATS_DAYS) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Ugyldig periode" });
    }
  });

export type StatsQuery = z.output<typeof statsQuerySchema>;
