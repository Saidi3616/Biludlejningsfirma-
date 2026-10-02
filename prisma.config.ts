import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Ikke `env()`: `prisma generate` skal kunne køre uden database (fx under install).
    url: process.env.DATABASE_URL,
  },
});
