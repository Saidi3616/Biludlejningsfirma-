import { z } from "zod";
import { DamageLiability } from "@/generated/prisma/enums";
import { kroner } from "./admin";

const amount = kroner.pipe(z.number().int().min(0).max(100_000_000));

/**
 * Afregning efter aflevering (F2). Beløb i kroner. Hver ny skade fra lejen skal have et afklaret
 * ansvar; beløbet opkræves kun, når kunden er ansvarlig.
 */
export const settlementSchema = z.object({
  extraKm: amount,
  fuel: amount,
  late: amount,
  damages: z
    .array(
      z.object({
        id: z.uuid(),
        liability: z.enum(DamageLiability).exclude(["UNDECIDED"]),
        amount,
      }),
    )
    .max(50)
    .default([]),
});
