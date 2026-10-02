import { describe, expect, it } from "vitest";
import { assertMinor, percentOf, roundToWholeUnits, sumMinor, vatIncluded } from "@/lib/money";

describe("penge", () => {
  it("runder til hele kroner", () => {
    expect(roundToWholeUnits(228456)).toBe(228500);
    expect(roundToWholeUnits(228449)).toBe(228400);
    expect(roundToWholeUnits(228450)).toBe(228500);
  });

  it("procent rundes til nærmeste øre", () => {
    expect(percentOf(99900, 10)).toBe(9990);
    expect(percentOf(33333, 15)).toBe(5000);
  });

  it("moms er 20 % af en pris inkl. 25 % moms", () => {
    expect(vatIncluded(125000, 25)).toBe(25000);
    expect(vatIncluded(99900, 25)).toBe(19980);
  });

  it("afviser floats", () => {
    expect(() => assertMinor(9.99)).toThrow();
    expect(() => sumMinor([100, 0.5])).toThrow();
    expect(() => roundToWholeUnits(Number.NaN)).toThrow();
  });
});
