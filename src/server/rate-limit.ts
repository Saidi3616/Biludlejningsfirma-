import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import { db } from "@/server/db";

/**
 * Enkel fast-vindue-begrænsning i databasen (deler tabellen med Better Auth, men med
 * præfikset "app:"). IP-adresser gemmes kun som hash.
 */
export async function assertRateLimit(
  scope: string,
  identifier: string,
  options: { max: number; windowMs: number; now?: Date },
) {
  const now = (options.now ?? new Date()).getTime();
  const key = `app:${scope}:${createHash("sha256").update(identifier).digest("hex").slice(0, 32)}`;
  const windowStart = now - options.windowMs;
  const [row] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" (id, key, count, "lastRequest")
    VALUES (gen_random_uuid(), ${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN 1 ELSE "RateLimit".count + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN ${now} ELSE "RateLimit"."lastRequest" END
    RETURNING count`;
  if ((row?.count ?? 0) > options.max) {
    throw new AppError("RATE_LIMITED", "For mange forsøg. Prøv igen senere.");
  }
}

/** Klientens IP fra proxyens header (Vercel sætter x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
  );
}
