import { describe, expect, it } from "vitest";
import { isOpenAt, type OpeningHoursRule } from "@/server/availability/opening-hours";

const tz = "Europe/Copenhagen";

function day(weekday: number, opensAt: string | null, closesAt: string | null, closed = false) {
  return { weekday, specialDate: null, opensAt, closesAt, closed } satisfies OpeningHoursRule;
}

// Kontor: hverdage 08–18, lørdag 09–15, søndag lukket.
const office: OpeningHoursRule[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => day(weekday, "08:00", "18:00")),
  day(6, "09:00", "15:00"),
  day(7, null, null, true),
];

describe("åbningstider", () => {
  it("hverdag: åbent fra åbning til og med lukketid, målt i dansk tid", () => {
    // Mandag 1. juni 2026 (sommertid, UTC+2).
    expect(isOpenAt(new Date("2026-06-01T06:00:00Z"), tz, office)).toBe(true); // 08:00
    expect(isOpenAt(new Date("2026-06-01T05:59:00Z"), tz, office)).toBe(false); // 07:59
    expect(isOpenAt(new Date("2026-06-01T16:00:00Z"), tz, office)).toBe(true); // 18:00
    expect(isOpenAt(new Date("2026-06-01T16:01:00Z"), tz, office)).toBe(false); // 18:01
  });

  it("vintertid flytter UTC-tidspunktet, ikke åbningstiden", () => {
    // Mandag 7. december 2026 (UTC+1): 08:00 lokal = 07:00 UTC.
    expect(isOpenAt(new Date("2026-12-07T07:00:00Z"), tz, office)).toBe(true);
    expect(isOpenAt(new Date("2026-12-07T06:30:00Z"), tz, office)).toBe(false);
  });

  it("lørdag kortere, søndag lukket", () => {
    expect(isOpenAt(new Date("2026-06-06T12:00:00Z"), tz, office)).toBe(true); // lør 14:00
    expect(isOpenAt(new Date("2026-06-06T14:00:00Z"), tz, office)).toBe(false); // lør 16:00
    expect(isOpenAt(new Date("2026-06-07T10:00:00Z"), tz, office)).toBe(false); // søn 12:00
  });

  it("en særlig dato erstatter ugedagen (helligdag eller ekstra åbent)", () => {
    const rules = [
      ...office,
      { weekday: null, specialDate: "2026-06-05", opensAt: null, closesAt: null, closed: true },
      {
        weekday: null,
        specialDate: "2026-06-07",
        opensAt: "10:00",
        closesAt: "12:00",
        closed: false,
      },
    ];
    expect(isOpenAt(new Date("2026-06-05T10:00:00Z"), tz, rules)).toBe(false); // grundlovsdag
    expect(isOpenAt(new Date("2026-06-07T09:00:00Z"), tz, rules)).toBe(true); // søn 11:00
    expect(isOpenAt(new Date("2026-06-07T11:00:00Z"), tz, rules)).toBe(false); // søn 13:00
  });

  it("flere perioder samme dag og lukketid ved midnat", () => {
    const rules = [day(1, "08:00", "12:00"), day(1, "13:00", "17:00"), day(2, "06:00", "00:00")];
    expect(isOpenAt(new Date("2026-06-01T10:30:00Z"), tz, rules)).toBe(false); // man 12:30
    expect(isOpenAt(new Date("2026-06-01T11:30:00Z"), tz, rules)).toBe(true); // man 13:30
    expect(isOpenAt(new Date("2026-06-02T21:45:00Z"), tz, rules)).toBe(true); // tir 23:45
  });

  it("uden åbningstider er der ingen begrænsning", () => {
    expect(isOpenAt(new Date("2026-06-07T02:00:00Z"), tz, [])).toBe(true);
  });
});
