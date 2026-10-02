import "dotenv/config";
import { vi } from "vitest";

// `server-only` kaster uden for Next.js' bundler; i tests er alt server-side.
vi.mock("server-only", () => ({}));
