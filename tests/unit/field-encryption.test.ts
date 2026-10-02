import { describe, expect, it } from "vitest";
import { decryptField, encryptField } from "@/server/crypto/fields";

describe("feltkryptering (M15)", () => {
  it("krypterer med tilfældig IV og dekrypterer igen", () => {
    const a = encryptField("DK-12345678");
    const b = encryptField("DK-12345678");
    expect(a).not.toBe(b);
    expect(a).not.toContain("12345678");
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptField(a)).toBe("DK-12345678");
    expect(decryptField(encryptField(""))).toBe("");
    expect(decryptField(encryptField("Ærø 1990-01-31"))).toBe("Ærø 1990-01-31");
  });

  it("afviser ændret indhold og ukendt format", () => {
    const value = encryptField("hemmeligt");
    const [version, iv, tag, data] = value.split(".");
    const flipped = Buffer.from(data!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() =>
      decryptField([version, iv, tag, flipped.toString("base64url")].join(".")),
    ).toThrow();
    expect(() => decryptField("v2.a.b.c")).toThrow();
    expect(() => decryptField("ren tekst")).toThrow();
  });
});
