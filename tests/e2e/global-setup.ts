import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";
import { E2E_PASSWORD, e2eUsers } from "./users";

/**
 * Opretter én bekræftet testbruger pr. rolle i databasen, som serveren bruger.
 * Kører mod DATABASE_URL (lokalt udviklingsdatabasen, i CI en tom database).
 */
export default async function globalSetup() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const hash = await hashPassword(E2E_PASSWORD);
    for (const user of Object.values(e2eUsers)) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO "User" (id, email, name, "emailVerified", role, "twoFactorEnabled", "disabledAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, true, $3, false, NULL, now())
         ON CONFLICT (email) DO UPDATE
           SET role = EXCLUDED.role, "emailVerified" = true, "twoFactorEnabled" = false, "disabledAt" = NULL
         RETURNING id`,
        [user.email, user.name, user.role],
      );
      const id = rows[0].id;
      await client.query(`DELETE FROM "TwoFactor" WHERE "userId" = $1`, [id]);
      await client.query(`DELETE FROM "Session" WHERE "userId" = $1`, [id]);
      await client.query(`DELETE FROM "Account" WHERE "userId" = $1`, [id]);
      await client.query(
        `INSERT INTO "Account" (id, "userId", "accountId", "providerId", password, "updatedAt")
         VALUES (gen_random_uuid(), $1::uuid, $1::text, 'credential', $2, now())`,
        [id, hash],
      );
    }
    await client.query(`DELETE FROM "RateLimit"`);
  } finally {
    await client.end();
  }
}
