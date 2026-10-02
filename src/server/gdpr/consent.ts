import "server-only";
import type { ConsentPurpose } from "@/generated/prisma/enums";
import { CONSENT_VERSION } from "@/lib/consent";
import { accountConsentSchema, cookieConsentSchema } from "@/lib/validation/consents";
import { parseInput } from "@/lib/validation/parse";
import { db } from "@/server/db";

/** Version af privatlivspolitikken, som kontoens samtykker gives under. */
export const PRIVACY_POLICY_VERSION = "1";

const ACCOUNT_PURPOSES = { marketing: "MARKETING", whatsapp: "WHATSAPP_MESSAGES" } as const;

/** Seneste valg pr. formål for kunden (ingen række = nej). */
export async function accountConsents(userId: string) {
  const rows = await db.consent.findMany({
    where: {
      customer: { userId },
      purpose: { in: Object.values(ACCOUNT_PURPOSES) },
    },
    orderBy: { createdAt: "desc" },
    select: { purpose: true, granted: true, createdAt: true },
  });
  const latest = (purpose: ConsentPurpose) => rows.find((row) => row.purpose === purpose);
  return {
    marketing: latest("MARKETING")?.granted ?? false,
    whatsapp: latest("WHATSAPP_MESSAGES")?.granted ?? false,
    updatedAt: rows[0]?.createdAt ?? null,
  };
}

/**
 * Samtykkeloggen er kun-tilføj: hver ændring er en ny række, så vi kan vise, hvad kunden sagde
 * ja eller nej til og hvornår. Uændrede valg skrives ikke igen.
 */
export async function setAccountConsents(
  user: { userId: string; email: string; name: string },
  input: Record<string, unknown>,
) {
  const values = parseInput(accountConsentSchema, input);
  const current = await accountConsents(user.userId);
  const [firstName = "", ...rest] = user.name.split(" ");
  await db.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { userId: user.userId },
      create: {
        userId: user.userId,
        email: user.email.toLowerCase(),
        firstName,
        lastName: rest.join(" "),
      },
      update: {},
      select: { id: true },
    });
    const changes = (Object.keys(ACCOUNT_PURPOSES) as (keyof typeof ACCOUNT_PURPOSES)[]).filter(
      (key) => values[key] !== current[key],
    );
    if (changes.length === 0) return;
    await tx.consent.createMany({
      data: changes.map((key) => ({
        customerId: customer.id,
        purpose: ACCOUNT_PURPOSES[key],
        granted: values[key],
        policyVersion: PRIVACY_POLICY_VERSION,
        source: "account",
      })),
    });
  });
}

/** Cookie-valget logges under besøgendes tilfældige id (ingen IP eller konto). */
export async function logCookieConsent(input: unknown) {
  const values = parseInput(cookieConsentSchema, input);
  await db.consent.createMany({
    data: [
      { purpose: "ANALYTICS" as const, granted: values.analytics },
      { purpose: "MARKETING" as const, granted: values.marketing },
    ].map((row) => ({
      ...row,
      anonymousId: values.id,
      policyVersion: `cookies-${CONSENT_VERSION}`,
      source: "cookie-banner",
    })),
  });
}
