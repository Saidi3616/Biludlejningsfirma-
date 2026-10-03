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

describe("ugedage og tidspunkter", () => {
  it("ugedag 1 er mandag og 7 er søndag på alle sprog", async () => {
    const { weekdayName } = await import("@/lib/format");
    expect(weekdayName(1, "da")).toBe("mandag");
    expect(weekdayName(7, "en")).toBe("Sunday");
    expect(weekdayName(5, "fr")).toBe("vendredi");
  });

  it("tidspunkt vises i lokationens tidszone", async () => {
    const { formatDateTime } = await import("@/lib/format");
    const text = formatDateTime(new Date("2026-06-01T08:00:00Z"), "en", "Europe/Copenhagen");
    expect(text).toContain("10:00");
    expect(text).toContain("Jun");
  });
});
