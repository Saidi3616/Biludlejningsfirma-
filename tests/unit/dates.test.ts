import { describe, expect, it } from "vitest";
import { fromLocal, localDateKey, localTimeKey, rentalDays, toLocal } from "@/lib/dates";

const CPH = "Europe/Copenhagen";
const GRACE = 59;

/** Lokal tid i København som UTC-instant (vintertid +1, sommertid +2). */
const at = (iso: string) => new Date(iso);

describe("lejedage", () => {
  it.each([
    ["1 minut", "2026-06-01T10:00:00+02:00", "2026-06-01T10:01:00+02:00", 1],
    ["præcis 24 timer", "2026-06-01T10:00:00+02:00", "2026-06-02T10:00:00+02:00", 1],
    ["24 t 59 min (tolerance)", "2026-06-01T10:00:00+02:00", "2026-06-02T10:59:00+02:00", 1],
    ["25 timer", "2026-06-01T10:00:00+02:00", "2026-06-02T11:00:00+02:00", 2],
    ["24 t 60 min", "2026-06-01T10:00:00+02:00", "2026-06-02T11:00:00+02:00", 2],
    ["3 dage", "2026-06-01T10:00:00+02:00", "2026-06-04T10:00:00+02:00", 3],
    ["6 dage + 1 time", "2026-06-01T10:00:00+02:00", "2026-06-07T11:00:00+02:00", 7],
    ["30 dage", "2026-06-01T10:00:00+02:00", "2026-07-01T10:00:00+02:00", 30],
    ["31 dage over månedsskift", "2026-01-15T09:00:00+01:00", "2026-02-15T09:00:00+01:00", 31],
  ])("%s", (_, from, to, days) => {
    expect(rentalDays(at(from), at(to), CPH, GRACE)).toBe(days);
  });

  it("aflevering før eller samtidig med afhentning er en fejl", () => {
    const t = at("2026-06-01T10:00:00+02:00");
    expect(() => rentalDays(t, t, CPH, GRACE)).toThrow(RangeError);
    expect(() => rentalDays(t, at("2026-06-01T09:00:00+02:00"), CPH, GRACE)).toThrow(RangeError);
  });

  describe("sommertid", () => {
    // 29. marts 2026 kl. 02:00 → 03:00 (natten har 23 timer).
    it("forår: lørdag 10 → søndag 10 er 1 dag, selv om der kun går 23 timer", () => {
      const from = at("2026-03-28T10:00:00+01:00");
      const to = at("2026-03-29T10:00:00+02:00");
      expect(to.getTime() - from.getTime()).toBe(23 * 3600_000);
      expect(rentalDays(from, to, CPH, GRACE)).toBe(1);
    });

    // 25. oktober 2026 kl. 03:00 → 02:00 (natten har 25 timer).
    it("efterår: lørdag 10 → søndag 10 er 1 dag, selv om der går 25 timer", () => {
      const from = at("2026-10-24T10:00:00+02:00");
      const to = at("2026-10-25T10:00:00+01:00");
      expect(to.getTime() - from.getTime()).toBe(25 * 3600_000);
      expect(rentalDays(from, to, CPH, GRACE)).toBe(1);
    });

    it("en uge hen over skiftet er 7 dage", () => {
      expect(
        rentalDays(at("2026-03-25T12:00:00+01:00"), at("2026-04-01T12:00:00+02:00"), CPH, GRACE),
      ).toBe(7);
    });
  });

  it("tælles i lokationens tidszone, ikke serverens", () => {
    // Samme to instants: 1 dag i København; i Casablanca (+1 hele året) også 1 dag.
    const from = at("2026-03-28T09:00:00Z");
    const to = at("2026-03-29T08:00:00Z");
    expect(rentalDays(from, to, CPH, GRACE)).toBe(1);
    expect(rentalDays(from, to, "Africa/Casablanca", GRACE)).toBe(1);
    expect(rentalDays(from, to, "UTC", GRACE)).toBe(1);
  });
});

describe("lokal dato", () => {
  it("kl. 23:30 UTC er næste dag i København", () => {
    expect(localDateKey(at("2026-06-30T23:30:00Z"), CPH)).toBe("2026-07-01");
    expect(toLocal(at("2026-06-30T23:30:00Z"), CPH)).toEqual({
      year: 2026,
      month: 7,
      day: 1,
      hour: 1,
      minute: 30,
    });
  });
});

describe("fromLocal", () => {
  const tz = "Europe/Copenhagen";

  it("dansk vægur-tid til UTC i sommer- og vintertid", () => {
    expect(fromLocal("2026-06-01", "10:00", tz).toISOString()).toBe("2026-06-01T08:00:00.000Z");
    expect(fromLocal("2026-12-01", "10:00", tz).toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("dagene med tidsskift", () => {
    // 29. marts 2026: 02:00 → 03:00. 01:30 er vintertid, 03:30 sommertid.
    expect(fromLocal("2026-03-29", "01:30", tz).toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(fromLocal("2026-03-29", "03:30", tz).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // 25. oktober 2026: 03:00 → 02:00.
    expect(fromLocal("2026-10-25", "12:00", tz).toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });

  it("er det omvendte af toLocal", () => {
    const instant = fromLocal("2026-07-15", "23:30", tz);
    expect(localDateKey(instant, tz)).toBe("2026-07-15");
    expect(localTimeKey(instant, tz)).toBe("23:30");
  });
});
