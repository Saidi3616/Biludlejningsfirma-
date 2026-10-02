import "dotenv/config";
import { vi } from "vitest";

// Integrationstests kører mod en separat database, så udviklingsdata ikke slettes.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Betalinger simuleres i tests (src/server/payments/providers/fake.ts).
process.env.FAKE_PAYMENTS = "true";
delete process.env.STRIPE_SECRET_KEY;

// `server-only` kaster uden for Next.js' bundler; i tests er alt server-side.
vi.mock("server-only", () => ({}));
