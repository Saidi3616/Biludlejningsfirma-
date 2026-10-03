import { describe, expect, it } from "vitest";
import { localizedPath, safeRedirectPath } from "@/i18n/paths";

describe("localizedPath", () => {
  it("dansk uden præfiks, øvrige sprog med", () => {
    expect(localizedPath("da", "/login")).toBe("/login");
    expect(localizedPath("en", "/login")).toBe("/en/login");
    expect(localizedPath("ar", "/")).toBe("/ar");
  });
});

describe("safeRedirectPath", () => {
  it("tillader relative stier", () => {
    expect(safeRedirectPath("/admin")).toBe("/admin");
    expect(safeRedirectPath("/en/account?x=1")).toBe("/en/account?x=1");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "admin",
    "/ok\r\nSet-Cookie: x=1",
    undefined,
    ["/admin"],
  ])("afviser %s", (value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });
});
