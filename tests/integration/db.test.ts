import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { GET } from "@/app/api/health/route";

describe("database", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("kan forbinde til Postgres", async () => {
    const rows = await db.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows[0]?.ok).toBe(1);
  });

  it("health-endpointet svarer ok", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });
});
