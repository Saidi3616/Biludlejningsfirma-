import "server-only";
import { createHash, createHmac, randomInt } from "node:crypto";
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
