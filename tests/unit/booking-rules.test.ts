import { describe, expect, it } from "vitest";
import { canTransition } from "@/server/booking/state";
import { generateManageToken, generateReference, hashManageToken } from "@/server/booking/tokens";

describe("bookingens livscyklus", () => {
  it("tilladte skift", () => {
    expect(canTransition("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransition("PENDING_PAYMENT", "EXPIRED")).toBe(true);
    expect(canTransition("CONFIRMED", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "COMPLETED")).toBe(true);
    expect(canTransition("EXPIRED", "CONFIRMED")).toBe(true);
  });

  it("afsluttede bookinger kan ikke genåbnes, og trin kan ikke springes over", () => {
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransition("PENDING_PAYMENT", "ACTIVE")).toBe(false);
    expect(canTransition("ACTIVE", "CANCELLED")).toBe(false);
  });
});

describe("reference og token", () => {
  it("referencen er kort og uden tegn, der kan forveksles", () => {
    for (let i = 0; i < 200; i++) expect(generateReference()).toMatch(/^BK-[2-9A-HJKMNP-Z]{6}$/);
  });

  it("kun hashen af tokenet gemmes", () => {
    const { token, hash } = generateManageToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hash).toBe(hashManageToken(token));
    expect(hash).not.toContain(token);
  });
});
