import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { customerContracts } from "@/server/account/service";
import type { PolicyContext } from "@/server/auth/policies";
import {
  contractContext,
  hashSignerIp,
  signContract,
  signedContractDocument,
  staffContractPdf,
} from "@/server/contracts/service";
import { buildContractSnapshot } from "@/server/contracts/snapshot";
import { db } from "@/server/db";
import { pickUp, privateDocument } from "@/server/inspections/service";
import { localStorageProvider } from "@/server/storage/local";
import { storage, useStorageForTests } from "@/server/storage";
import { bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let staff: PolicyContext;
let root: string;

const now = new Date();
const HOUR = 3_600_000;
const IP = "203.0.113.7";

async function actor(role: Role): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email: `${role.toLowerCase()}@example.com`, name: role, role, emailVerified: true },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("forventede en fejl");
}

async function png(svgBody: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">${svgBody}</svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

const signature = () =>
  png(
    '<path d="M40 200 C 200 40, 400 260, 760 80" stroke="#0b2c33" stroke-width="6" fill="none"/>',
  );
const blank = () => png("");

/** Bekræftet og betalt booking på bil A med afhentning for en time siden. */
async function paidBooking(status: "CONFIRMED" | "PENDING_PAYMENT" = "CONFIRMED") {
  const pickupAt = new Date(now.getTime() - HOUR);
  const returnAt = new Date(pickupAt.getTime() + 72 * HOUR);
  const booking = await db.booking.create({
    data: {
      ...bookingData(fleet, fleet.carA.id, pickupAt.toISOString(), returnAt.toISOString(), {
        status,
      }),
      locale: "ar",
      termsVersion: "2026-10-01",
      items: {
        create: [
          {
            type: "RENTAL",
            labelSnapshot: "Leje",
            quantity: 3,
            unitPriceMinor: 33300,
            currency: "DKK",
            totalMinor: 99900,
          },
        ],
      },
    },
  });
  await db.payment.create({
    data: {
      bookingId: booking.id,
      kind: "MANUAL",
      status: "SUCCEEDED",
      method: "CASH",
      amountMinor: booking.totalMinor,
      currency: "DKK",
      provider: "manual",
    },
  });
  return booking;
}

const handover = { odometerKm: "1200", fuelLevel: "8", notes: "" };

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "contract-test-"));
  useStorageForTests(localStorageProvider(root));
});

afterAll(async () => {
  useStorageForTests(undefined);
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  staff = await actor("STAFF");
});

describe("kontraktens indhold", () => {
  it("fastfryser vilkår, priser og bil; arabisk kontrakt laves på engelsk", async () => {
    const booking = await paidBooking();
    const snapshot = await buildContractSnapshot(booking.id);
    expect(snapshot).toMatchObject({
      locale: "en",
      reference: booking.reference,
      termsVersion: "2026-10-01",
      car: { registrationNumber: fleet.carA.registrationNumber },
      items: [{ label: "Rental, 3 days", totalMinor: 99900 }],
      totalMinor: 99900,
      currency: "DKK",
    });
    expect(snapshot.terms.length).toBeGreaterThan(3);
    expect(snapshot.terms.at(-1)?.body).toContain("started hour");
  });

  it("personalet kan se et udkast som PDF før underskrift", async () => {
    const booking = await paidBooking();
    const pdf = await staffContractPdf(staff, booking.id);
    expect(pdf.signed).toBe(false);
    expect(Buffer.from(pdf.body.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("underskrift ved udlevering", () => {
  it("udlevering kræver underskrift; underskriften gemmer PDF, hash og IP-hash", async () => {
    const booking = await paidBooking();
    expect(await failure(pickUp(staff, booking.id, handover, now))).toMatchObject({
      code: "CONFLICT",
      details: { reason: "CONTRACT_MISSING" },
    });
    expect(await signedContractDocument(booking.id)).toBeNull();

    const result = await signContract(
      staff,
      booking.id,
      { signerName: " Test Kunde ", signature: await signature(), accept: "on" },
      { ip: IP },
      now,
    );

    const contract = await db.contract.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(contract).toMatchObject({
      id: result.contractId,
      signerName: "Test Kunde",
      signedAt: now,
      signedIpHash: hashSignerIp(IP),
      pdfDocumentId: result.documentId,
    });
    expect(contract.signedIpHash).not.toContain(IP);
    expect(contract.termsSnapshot).toMatchObject({ reference: booking.reference, locale: "en" });

    const document = await db.document.findUniqueOrThrow({ where: { id: result.documentId } });
    expect(document).toMatchObject({
      ownerType: "CONTRACT",
      ownerId: contract.id,
      kind: "CONTRACT_PDF",
      mimeType: "application/pdf",
      visibility: "PRIVATE",
    });
    expect(document.storageKey).toMatch(/^private\/contract\//);
    const stored = await storage().get(document.storageKey);
    expect(createHash("sha256").update(stored!.body).digest("hex")).toBe(document.sha256);
    expect(await storage().get(contract.signatureStorageKey!)).not.toBeNull();

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "contract.sign" } });
    expect(JSON.stringify(audit.diff)).not.toContain("Test Kunde");

    expect((await contractContext(staff, booking.id)).contract?.signedAt).toEqual(now);
    expect((await staffContractPdf(staff, booking.id)).signed).toBe(true);
    expect(await signedContractDocument(booking.id)).toMatchObject({
      storageKey: document.storageKey,
    });
    await expect(pickUp(staff, booking.id, handover, now)).resolves.toBeTruthy();

    // Kunden ser kontrakten under Dokumenter; andre kunder ser den ikke.
    const user = await db.user.create({
      data: { email: "anna@example.com", name: "Anna", role: "CUSTOMER", emailVerified: true },
    });
    expect(await customerContracts(user.id)).toEqual([]);
    await db.customer.update({ where: { id: fleet.customer.id }, data: { userId: user.id } });
    expect(await customerContracts(user.id)).toEqual([
      expect.objectContaining({ reference: booking.reference, signedAt: now }),
    ]);
  });

  it("afviser tomt felt, forkerte data og manglende accept", async () => {
    const booking = await paidBooking();
    const base = { signerName: "Test Kunde", signature: await signature(), accept: "on" };
    expect(
      await failure(
        signContract(staff, booking.id, { ...base, signature: await blank() }, { ip: IP }),
      ),
    ).toMatchObject({ code: "VALIDATION_FAILED", details: { reason: "SIGNATURE_MISSING" } });
    expect(
      await failure(
        signContract(
          staff,
          booking.id,
          { ...base, signature: "data:image/png;base64,aGVq" },
          { ip: IP },
        ),
      ),
    ).toMatchObject({ code: "VALIDATION_FAILED", details: { fields: ["signature"] } });
    expect(
      await failure(signContract(staff, booking.id, { ...base, accept: null }, { ip: IP })),
    ).toMatchObject({ code: "VALIDATION_FAILED", details: { fields: ["accept"] } });
    expect(await db.contract.count()).toBe(0);
    expect(await db.document.count()).toBe(0);
  });

  it("kan kun underskrives én gang og kun på en bekræftet booking", async () => {
    const pending = await paidBooking("PENDING_PAYMENT");
    const input = { signerName: "Test Kunde", signature: await signature(), accept: "on" };
    expect(await failure(signContract(staff, pending.id, input, { ip: IP }))).toMatchObject({
      code: "CONFLICT",
    });

    await db.payment.deleteMany({ where: { bookingId: pending.id } });
    await db.booking.delete({ where: { id: pending.id } });
    const booking = await paidBooking();
    await signContract(staff, booking.id, input, { ip: IP });
    expect(await failure(signContract(staff, booking.id, input, { ip: IP }))).toMatchObject({
      code: "CONFLICT",
    });
    expect(await db.document.count({ where: { ownerType: "CONTRACT" } })).toBe(1);
  });

  it("kun personale kan underskrive og se kontrakten", async () => {
    const booking = await paidBooking();
    const input = { signerName: "Test Kunde", signature: await signature(), accept: "on" };
    const customer: PolicyContext = {
      actor: { userId: fleet.customer.id, role: "CUSTOMER", twoFactorEnabled: false },
    };
    expect((await failure(signContract(customer, booking.id, input, { ip: IP }))).code).toBe(
      "FORBIDDEN",
    );
    expect((await failure(signContract({ actor: null }, booking.id, input, { ip: IP }))).code).toBe(
      "UNAUTHENTICATED",
    );
    const { documentId } = await signContract(staff, booking.id, input, { ip: IP });
    await expect(privateDocument(staff, documentId)).resolves.toMatchObject({
      mimeType: "application/pdf",
    });
    expect((await failure(privateDocument(customer, documentId))).code).toBe("FORBIDDEN");
  });
});
