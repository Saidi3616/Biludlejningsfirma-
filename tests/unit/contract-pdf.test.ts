import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderContractPdf } from "@/server/contracts/pdf";
import { contractLocale, type ContractSnapshot } from "@/server/contracts/snapshot";

const snapshot: ContractSnapshot = {
  termsVersion: "2026-10-01",
  locale: "da",
  reference: "BK-ABCDEF",
  landlord: { name: "Biludlejning", phone: "+45 00 00 00 00", email: "kontakt@example.com" },
  renter: { name: "Test Kunde", email: "kunde@example.com", phone: "+4512345678" },
  car: { name: "Kia Picanto", registrationNumber: "AB 12 345" },
  pickup: { location: "København", at: "2026-10-02T08:00:00.000Z", timeZone: "Europe/Copenhagen" },
  return: { location: "København", at: "2026-10-05T08:00:00.000Z", timeZone: "Europe/Copenhagen" },
  items: [
    { label: "Leje, 3 dage", totalMinor: 89700 },
    { label: "Barnesæde", totalMinor: 15000 },
  ],
  totalMinor: 104700,
  depositMinor: 300000,
  currency: "DKK",
  includedKmPerDay: 200,
  extraKmFeeMinor: 250,
  fuelPerEighthMinor: 10000,
  latePerHourMinor: 15000,
  graceMinutes: 59,
  terms: [{ title: "Aflevering", body: "Bilen afleveres på det aftalte sted og tidspunkt." }],
};

describe("kontrakt-PDF", () => {
  it("arabisk bliver engelsk; dansk og fransk bevares", () => {
    expect(contractLocale("ar")).toBe("en");
    expect(contractLocale("fr")).toBe("fr");
    expect(contractLocale("da")).toBe("da");
  });

  it("laves med og uden underskrift", async () => {
    const image = new Uint8Array(
      await sharp({ create: { width: 400, height: 150, channels: 3, background: "#ffffff" } })
        .png()
        .toBuffer(),
    );
    const signed = await renderContractPdf(snapshot, {
      name: "Test Kunde",
      signedAt: new Date("2026-10-02T08:05:00.000Z"),
      image,
    });
    const draft = await renderContractPdf(snapshot, null);
    if (process.env.CONTRACT_PDF_OUT) await writeFile(process.env.CONTRACT_PDF_OUT, signed);
    for (const pdf of [signed, draft]) {
      expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
    }
    expect(signed.byteLength).toBeGreaterThan(draft.byteLength);
  });
});
