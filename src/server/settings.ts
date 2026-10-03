import "server-only";
import { cache } from "react";
import { site } from "@/config/site";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";

export type SiteContact = {
  phone: string;
  email: string;
  /** Kun cifre med landekode, som wa.me kræver. */
  whatsappNumber: string;
  address: string | null;
};

/**
 * Firmaets kontaktoplysninger fra /admin/settings. Felter, der ikke er sat, falder tilbage til
 * pladsholderne i src/config/site.ts. Kan databasen ikke nås (fx under et build uden database),
 * bruges pladsholderne, så siden stadig kan vises.
 */
export const getSiteContact = cache(async (): Promise<SiteContact> => {
  const row = await db.siteSettings.findUnique({ where: { id: 1 } }).catch((error: unknown) => {
    logger.warn({ err: error }, "site settings unavailable, using defaults");
    return null;
  });
  return {
    phone: row?.phone ?? site.phone,
    email: row?.email ?? site.email,
    whatsappNumber: row?.whatsappNumber ?? site.whatsappNumber,
    address: row?.address ?? null,
  };
});
