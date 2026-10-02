import { describe, expect, it } from "vitest";
import { CONSENT_COOKIE, parseConsent, serializeConsent } from "@/lib/consent";

describe("cookie-samtykke", () => {
  it("kan læse det, den selv skriver", () => {
    const cookie = serializeConsent(
      { analytics: true, marketing: false },
      new Date("2026-10-02T00:00:00Z"),
    );
    const value = cookie.split(";")[0]!.slice(CONSENT_COOKIE.length + 1);
    expect(parseConsent(value)).toEqual({
      v: 1,
      at: "2026-10-02T00:00:00.000Z",
      analytics: true,
      marketing: false,
    });
    expect(cookie).toContain("SameSite=Lax");
  });

  it("ignorerer ødelagte værdier og gamle politik-versioner", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("ikke-json")).toBeNull();
    expect(parseConsent(encodeURIComponent(JSON.stringify({ v: 0, analytics: true })))).toBeNull();
  });

  it("tolker kun eksplicit true som samtykke", () => {
    const raw = encodeURIComponent(JSON.stringify({ v: 1, analytics: "yes", marketing: 1 }));
    expect(parseConsent(raw)).toMatchObject({ analytics: false, marketing: false });
  });
});
