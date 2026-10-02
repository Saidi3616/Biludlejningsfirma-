/**
 * Cookie-samtykke. Gemmes i en førsteparts-cookie, så serveren også kan læse
 * den. Logning i Consent-tabellen tilføjes i M15.
 */
export const CONSENT_COOKIE = "consent";
export const CONSENT_VERSION = 1;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 6 måneder, derefter spørges igen

export type ConsentChoice = { analytics: boolean; marketing: boolean };
export type StoredConsent = ConsentChoice & { v: number; at: string };

export function parseConsent(raw: string | undefined): StoredConsent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<StoredConsent>;
    if (value.v !== CONSENT_VERSION) return null; // ny politik-version kræver nyt samtykke
    return {
      v: value.v,
      at: String(value.at ?? ""),
      analytics: value.analytics === true,
      marketing: value.marketing === true,
    };
  } catch {
    return null;
  }
}

export function serializeConsent(choice: ConsentChoice, now = new Date()): string {
  const value: StoredConsent = { v: CONSENT_VERSION, at: now.toISOString(), ...choice };
  return `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** Den rå cookie-værdi i browseren ("" hvis ikke sat). */
export function readConsentCookie(): string {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  return match?.slice(CONSENT_COOKIE.length + 1) ?? "";
}
