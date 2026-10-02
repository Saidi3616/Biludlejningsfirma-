import { describe, expect, it } from "vitest";
import { parseKroner } from "@/lib/validation/admin";

describe("parseKroner", () => {
  it("læser danske og internationale beløb som øre", () => {
    expect(parseKroner("450")).toBe(45000);
    expect(parseKroner("450,5")).toBe(45050);
    expect(parseKroner("1.250,50")).toBe(125050);
    expect(parseKroner("1.250")).toBe(125000);
    expect(parseKroner("12.5")).toBe(1250);
    expect(parseKroner("1 250 kr.")).toBe(125000);
    expect(parseKroner("0")).toBe(0);
  });

  it("afviser negative, tomme og for præcise beløb", () => {
    for (const value of ["", "-5", "abc", "1,234", "1.2.3", "12,345"]) {
      expect(parseKroner(value)).toBeNull();
    }
  });
});
