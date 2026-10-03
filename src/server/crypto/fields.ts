import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Feltkryptering (M15) til følsomme kundefelter, fx fødselsdato og kørekortnummer
 * (`*Enc` i Customer). AES-256-GCM med tilfældig IV; formatet er `v1.<iv>.<tag>.<data>` i
 * base64url. Nøglen er FIELD_ENCRYPTION_KEY (32 bytes, base64) og må aldrig skiftes uden at
 * genkryptere data. Lokalt bruges en fast udviklingsnøgle.
 */
const VERSION = "v1";
const DEV_KEY = createHash("sha256")
  .update("local-field-encryption-key-not-for-production")
  .digest();

let cachedKey: Buffer | undefined;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const env = serverEnv();
  if (env.FIELD_ENCRYPTION_KEY) {
    const decoded = Buffer.from(env.FIELD_ENCRYPTION_KEY, "base64");
    if (decoded.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY skal være 32 bytes (base64)");
    cachedKey = decoded;
  } else if (env.APP_ENV === "local") {
    cachedKey = DEV_KEY;
  } else {
    throw new AppError("SERVICE_UNAVAILABLE", "FIELD_ENCRYPTION_KEY mangler");
  }
  return cachedKey;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** Kaster ved forkert nøgle eller ændret indhold (GCM-tag). */
export function decryptField(value: string): string {
  const [version, iv, tag, data] = value.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error("Ukendt format for krypteret felt");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Kun til tests. */
export function resetFieldKeyForTests() {
  cachedKey = undefined;
}
