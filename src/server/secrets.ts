import "server-only";
import { serverEnv } from "@/lib/env";

/** Kun til lokal udvikling og tests. Uden for `local` kræves AUTH_SECRET. */
const DEV_SECRET = "local-development-secret-not-for-production-use-0000";

/** Hemmeligheden bag login-sessioner og signerede links. */
export function appSecret(): string {
  const env = serverEnv();
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (env.APP_ENV === "local") return DEV_SECRET;
  throw new Error("AUTH_SECRET mangler");
}
