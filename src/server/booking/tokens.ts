import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { appSecret } from "@/server/secrets";

/** Uden 0/O, 1/I/L, så referencen kan læses op i telefonen. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERENCE_LENGTH = 6;

/** Kort reference til kunden, fx "BK-7Q4F2M". Unik i databasen; ved kollision prøves igen. */
export function generateReference(): string {
  let code = "";
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `BK-${code}`;
}

/**
 * Gæstens "administrér booking"-token (K7). Det er signeret med appens hemmelighed, så e-mails
 * kan bygge linket uden at tokenet ligger i databasen; kun hashen gemmes på bookingen.
 * Slettes hashen, virker linket ikke længere.
 */
export function manageTokenFor(reference: string): { token: string; hash: string } {
  const token = createHmac("sha256", appSecret())
    .update(`booking-manage:${reference}`)
    .digest("base64url");
  return { token, hash: hashManageToken(token) };
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function reviewSignature(reference: string) {
  return createHmac("sha256", appSecret())
    .update(`booking-review:${reference}`)
    .digest("base64url");
}

/**
 * Link-token til anmeldelsen (E8): referencen plus en signatur, så kun den, der har fået
 * e-mailen, kan anmelde bookingen. Intet gemmes i databasen.
 */
export function reviewTokenFor(reference: string): string {
  return `${reference}.${reviewSignature(reference)}`;
}

/** Referencen for et gyldigt anmeldelses-token, ellers null. */
export function referenceFromReviewToken(token: string): string | null {
  const match = /^(BK-[2-9A-HJKMNP-Z]{6})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const expected = Buffer.from(reviewSignature(match[1]!));
  const given = Buffer.from(match[2]!);
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1]! : null;
}
