import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";

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
 * Gæstens "administrér booking"-token (K13). Kun hashen gemmes; selve tokenet sendes i
 * bekræftelsesmailen og kan ikke genskabes fra databasen.
 */
export function generateManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashManageToken(token) };
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
