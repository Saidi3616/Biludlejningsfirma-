import "server-only";
import path from "node:path";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { localStorageProvider } from "./local";
import { s3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let cached: StorageProvider | undefined;

/**
 * S3/R2, når STORAGE_*-variablerne er sat. Ellers en lokal mappe, men kun når APP_ENV er
 * local: på staging og production kan filer ikke gemmes uden storage.
 */
export function storage(): StorageProvider {
  if (cached) return cached;
  const env = serverEnv();
  if (
    env.STORAGE_ENDPOINT &&
    env.STORAGE_ACCESS_KEY_ID &&
    env.STORAGE_SECRET_ACCESS_KEY &&
    env.STORAGE_BUCKET_PRIVATE &&
    env.STORAGE_BUCKET_PUBLIC
  ) {
    cached = s3StorageProvider({
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      publicBucket: env.STORAGE_BUCKET_PUBLIC,
      privateBucket: env.STORAGE_BUCKET_PRIVATE,
    });
  } else if (env.APP_ENV === "local") {
    cached = localStorageProvider(env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), ".storage"));
  } else {
    throw new AppError("SERVICE_UNAVAILABLE", "Fil-storage er ikke sat op (STORAGE_* mangler)");
  }
  return cached;
}

/** Kun til tests: brug en bestemt udbyder. */
export function useStorageForTests(provider: StorageProvider | undefined) {
  cached = provider;
}
