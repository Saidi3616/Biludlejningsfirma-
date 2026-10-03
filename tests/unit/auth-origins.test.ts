import { describe, expect, it } from "vitest";
import { vercelOrigins } from "@/server/auth/origins";

describe("vercelOrigins", () => {
  it("er tom uden for Vercel", () => {
    expect(vercelOrigins({})).toEqual([]);
  });

  it("giver https-adresser for udgivelse, gren og produktion uden dubletter", () => {
    expect(
      vercelOrigins({
        VERCEL_URL: "app-abc123-team.vercel.app",
        VERCEL_BRANCH_URL: "app-git-development-team.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "app-git-development-team.vercel.app",
      }),
    ).toEqual([
      "https://app-abc123-team.vercel.app",
      "https://app-git-development-team.vercel.app",
    ]);
  });
});
