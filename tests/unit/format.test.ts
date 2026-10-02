import { describe, expect, it } from "vitest";
import { formatMoney as format } from "@/lib/format";

// Intl bruger hårde mellemrum; de normaliseres, så forventningerne er læsbare.
const formatMoney = (...args: Parameters<typeof format>) => format(...args).replace(/\s/g, " ");

describe("formatMoney", () => {
  it("viser hele kroner uden decimaler på dansk", () => {
    expect(formatMoney(39900, "DKK", "da")).toBe("399 kr.");
  });

  it("viser decimaler når beløbet ikke er helt", () => {
    expect(formatMoney(28557, "DKK", "da")).toBe("285,57 kr.");
  });

  it("bruger vestlige cifre på arabisk", () => {
    expect(formatMoney(199900, "EUR", "ar")).toMatch(/1[.,]?999/);
  });

  it("afviser beløb der ikke er heltal i mindste enhed", () => {
    expect(() => formatMoney(399.5, "DKK", "da")).toThrow();
  });
});
