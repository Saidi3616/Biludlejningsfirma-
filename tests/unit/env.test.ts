import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const valid = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("parseServerEnv", () => {
  it("accepterer et minimalt gyldigt miljø og sætter standardværdier", () => {
    const env = parseServerEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.APP_ENV).toBe("local");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("fejler med feltnavnet når DATABASE_URL mangler", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("afviser en database-URL der ikke er Postgres", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://u:p@localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("behandler tomme strenge som ikke sat", () => {
    const env = parseServerEnv({ ...valid, SENTRY_DSN: "" });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("lækker aldrig værdier i fejlbeskeden", () => {
    const secret = "postgresql-but-not-a-url-supersecret";
    expect(() => parseServerEnv({ DATABASE_URL: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
