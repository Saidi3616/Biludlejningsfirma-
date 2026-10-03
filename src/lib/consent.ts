/**
 * Cookie-samtykke. Gemmes i en førsteparts-cookie, så serveren også kan læse den, og logges i
 * Consent-tabellen under et tilfældigt id (`id`), så valget kan dokumenteres (M15).
 */
export const CONSENT_COOKIE = "consent";
export const CONSENT_VERSION = 1;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 6 måneder, derefter spørges igen

export type ConsentChoice = { analytics: boolean; marketing: boolean };
export type StoredConsent = ConsentChoice & { v: number; at: string; id?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      ...(typeof value.id === "string" && UUID.test(value.id) ? { id: value.id } : {}),
    };
  } catch {
    return null;
  }
}

export function serializeConsent(choice: ConsentChoice, now = new Date(), id?: string): string {
  const value: StoredConsent = {
    v: CONSENT_VERSION,
    at: now.toISOString(),
    ...choice,
    ...(id ? { id } : {}),
  };
  return `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`;
}

/** Den rå cookie-værdi i browseren ("" hvis ikke sat). */
export function readConsentCookie(): string {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  return match?.slice(CONSENT_COOKIE.length + 1) ?? "";
}

/**
 * Lille script i <head>, der kører før første visning: har besøgende allerede valgt, får <html>
 * klassen "has-consent", så det server-renderede banner skjules uden at blinke. Banneret kan
 * dermed ligge i den første HTML, hvilket gør siden hurtigere for nye besøgende.
 */
export const consentPrecheckScript = `try{var m=document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=([^;]*)/);if(m&&JSON.parse(decodeURIComponent(m[1])).v===${CONSENT_VERSION})document.documentElement.classList.add("has-consent")}catch(e){}`;
