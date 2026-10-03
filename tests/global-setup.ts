import "dotenv/config";
import { execSync } from "node:child_process";

/** Bringer testdatabasen op på nyeste migration, før testene kører. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL eller DATABASE_URL skal være sat.");
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
