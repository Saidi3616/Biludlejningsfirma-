import { describe, expect, it } from "vitest";
import { calendarEvent } from "@/lib/ics";
import {
  checkoutDetailsSchema,
  checkoutQueryParams,
  normalizePhone,
  parseCheckoutQuery,
} from "@/lib/validation/checkout";

describe("bookingflowets URL", () => {
  it("læser ekstraudstyr, zone og rabatkode og ignorerer ugyldige værdier", () => {
    const query = parseCheckoutQuery({
      car: "volkswagen-golf",
      x_gps: "1",
      x_child_seat: ["2", "5"],
      x_wifi: "0",
      "x_bad code": "1",
      x_booster: "abc",
      zone: "10",
      discount: "velkommen10",
      step: "details",
    });
    expect(query).toEqual({
      car: "volkswagen-golf",
      zone: 10,
      discount: "VELKOMMEN10",
      step: "details",
      extras: [
        { code: "gps", quantity: 1 },
        { code: "child_seat", quantity: 2 },
      ],
    });
    expect(checkoutQueryParams(query)).toEqual({
      car: "volkswagen-golf",
      zone: "10",
      discount: "VELKOMMEN10",
      x_gps: "1",
      x_child_seat: "2",
    });
  });

  it("ukendt trin og tom zone falder tilbage til standard", () => {
    expect(parseCheckoutQuery({ step: "betaling", zone: "" })).toEqual({
      step: "extras",
      extras: [],
    });
  });
});

describe("kundens oplysninger", () => {
  it("danske numre får landekode; mellemrum fjernes", () => {
    expect(normalizePhone("12 34 56 78")).toBe("+4512345678");
    expect(normalizePhone("0046 70-123 45 67")).toBe("+46701234567");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("kræver accept af vilkår og gyldige felter", () => {
    const result = checkoutDetailsSchema.safeParse({
      firstName: " ",
      lastName: "Hansen",
      email: "ikke-en-mail",
      phone: "123",
      idempotencyKey: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      "acceptTerms",
      "email",
      "firstName",
      "phone",
    ]);
  });
});

describe("kalenderfil", () => {
  it("har start, slut og escapede tekster", () => {
    const ics = calendarEvent({
      uid: "BK-ABC234@test",
      title: "Billeje: VW Golf, automat",
      location: "København; Testvej 1",
      start: new Date("2026-06-01T08:00:00Z"),
      end: new Date("2026-06-04T08:00:00Z"),
      now: new Date("2026-05-01T08:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20260601T080000Z");
    expect(ics).toContain("DTEND:20260604T080000Z");
    expect(ics).toContain("SUMMARY:Billeje: VW Golf\\, automat");
    expect(ics).toContain(String.raw`LOCATION:København\; Testvej 1`);
  });
});
