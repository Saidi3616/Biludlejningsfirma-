import { z } from "zod";

/** Søgning efter ledige biler i en periode (katalog og forside). */
export const availabilitySearchSchema = z.object({
  pickupLocationId: z.uuid(),
  returnLocationId: z.uuid(),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
  categoryId: z.uuid().nullish(),
});

/** Er en bestemt model ledig (bil-siden)? */
export const availabilityCheckSchema = availabilitySearchSchema.extend({
  carModelId: z.uuid(),
});

export type AvailabilitySearch = z.input<typeof availabilitySearchSchema>;
export type AvailabilityCheck = z.input<typeof availabilityCheckSchema>;
