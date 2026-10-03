import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import type { PolicyContext } from "@/server/auth/policies";
import { encryptField } from "@/server/crypto/fields";
import { db } from "@/server/db";
import { accountConsents, logCookieConsent, setAccountConsents } from "@/server/gdpr/consent";
import { runRetention } from "@/server/gdpr/retention";
import {
  anonymizeBlocker,
  anonymizeCustomer,
  CONTRACT_RETENTION_YEARS,
  deleteOwnAccount,
  exportCustomer,
  exportOwnData,
} from "@/server/gdpr/service";
import { useStorageForTests } from "@/server/storage";
import type { StorageProvider, StoredObject } from "@/server/storage/types";
import { bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let manager: PolicyContext;
let staff: PolicyContext;
const files = new Map<string, StoredObject>();

const memory: StorageProvider = {
  async put(key, body, contentType) {
    files.set(key, { body, contentType });
  },
  async get(key) {
    return files.get(key) ?? null;
  },
  async delete(key) {
    files.delete(key);
  },
};

async function actor(role: Role, email: string): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email, name: role, role, emailVerified: true, twoFactorEnabled: true },
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

async function file(key: string) {
  await memory.put(key, new Uint8Array([1, 2, 3]), "application/octet-stream");
  return key;
}

/** Kunden med login, en afsluttet leje med kontrakt, betaling, besked, anmeldelse og kørekort. */
async function customerWithHistory() {
  const user = await db.user.create({
    data: { email: "anna@example.com", name: "Anna Jensen", emailVerified: true },
  });
  await db.session.create({
    data: { userId: user.id, token: "session-token", expiresAt: new Date(Date.now() + 3600_000) },
  });
  await db.customer.update({
    where: { id: fleet.customer.id },
    data: {
      userId: user.id,
      phoneE164: "+4512345678",
      addressLine: "Testvej 1",
      licenseNumberEnc: encryptField("DK-12345678"),
    },
  });
  const booking = await db.booking.create({
    data: {
      ...bookingData(fleet, fleet.carA.id, "2026-03-02T10:00:00Z", "2026-03-04T10:00:00Z", {
        status: "COMPLETED",
      }),
      deliveryAddress: "Leveringsvej 2",
      manageTokenHash: "hash",
    },
  });
  await db.payment.create({
    data: {
      bookingId: booking.id,
      kind: "CHARGE",
      status: "SUCCEEDED",
      method: "CARD",
      amountMinor: 99900,
      currency: "DKK",
      cardLast4: "4242",
    },
  });
  const pdfKey = await file("private/contracts/test/contract.pdf");
  const signatureKey = await file("private/contracts/test/signature.png");
  const pdf = await db.document.create({
    data: {
      ownerType: "BOOKING",
      ownerId: booking.id,
      kind: "CONTRACT_PDF",
      storageKey: pdfKey,
      mimeType: "application/pdf",
      sizeBytes: 3,
      sha256: "0".repeat(64),
    },
  });
  await db.contract.create({
    data: {
      bookingId: booking.id,
      termsSnapshot: {},
      signerName: "Anna Jensen",
      signedAt: new Date("2026-03-02T10:00:00Z"),
      signatureStorageKey: signatureKey,
      pdfDocumentId: pdf.id,
    },
  });
  const licenseKey = await file("private/customers/test/license.webp");
  await db.document.create({
    data: {
      ownerType: "CUSTOMER",
      ownerId: fleet.customer.id,
      kind: "LICENSE",
      storageKey: licenseKey,
      mimeType: "image/webp",
      sizeBytes: 3,
      sha256: "1".repeat(64),
    },
  });
  await db.message.create({
    data: {
      customerId: fleet.customer.id,
      channel: "EMAIL",
      direction: "INBOUND",
      name: "Anna Jensen",
      email: "anna@example.com",
      subject: "Spørgsmål",
      body: "Mit telefonnummer er 12345678",
    },
  });
  await db.review.create({
    data: {
      bookingId: booking.id,
      customerId: fleet.customer.id,
      rating: 5,
      displayName: "Anna J.",
    },
  });
  return { user, booking, pdfKey, signatureKey, licenseKey, pdfId: pdf.id };
}

beforeAll(() => useStorageForTests(memory));
afterAll(() => useStorageForTests(undefined));

beforeEach(async () => {
  await resetDb();
  files.clear();
  fleet = await createFleet();
  manager = await actor("MANAGER", "leder@example.com");
  staff = await actor("STAFF", "medarbejder@example.com");
});

describe("GDPR (F10)", () => {
  it("eksporterer alt om kunden og logger det", async () => {
    const { user } = await customerWithHistory();
    expect((await failure(exportCustomer(staff, fleet.customer.id))).code).toBe("FORBIDDEN");
    const data = await exportCustomer(manager, fleet.customer.id);
    expect(data.profile).toMatchObject({
      email: "anna@example.com",
      phoneE164: "+4512345678",
      licenseNumber: "DK-12345678",
      dateOfBirth: null,
      user: { email: "anna@example.com" },
    });
    expect(data.bookings).toHaveLength(1);
    expect(data.bookings[0]).toMatchObject({
      car: "Test Model",
      pickupLocation: "Test",
      deliveryAddress: "Leveringsvej 2",
      payments: [{ amountMinor: 99900, cardLast4: "4242" }],
      contract: { signerName: "Anna Jensen" },
    });
    expect(data.bookings[0]).not.toHaveProperty("manageTokenHash");
    expect(data.documents).toEqual([expect.objectContaining({ kind: "LICENSE" })]);
    expect(data.profile.messages[0]).toMatchObject({ body: "Mit telefonnummer er 12345678" });

    const own = await exportOwnData(user.id);
    expect(own).toMatchObject({ profile: { email: "anna@example.com" } });
    expect(
      await db.auditLog.count({
        where: { action: "customer.export", entityId: fleet.customer.id },
      }),
    ).toBe(2);
  });

  it("anonymiserer: persondata og filer væk, bookinger og betalinger bevaret", async () => {
    const { user, booking, pdfKey, signatureKey, licenseKey, pdfId } = await customerWithHistory();
    expect((await failure(anonymizeCustomer(staff, fleet.customer.id))).code).toBe("FORBIDDEN");
    await anonymizeCustomer(manager, fleet.customer.id);

    const customer = await db.customer.findUniqueOrThrow({ where: { id: fleet.customer.id } });
    expect(customer).toMatchObject({
      firstName: "Anonym",
      lastName: "",
      phoneE164: null,
      addressLine: null,
      licenseNumberEnc: null,
      userId: null,
    });
    expect(customer.email).toMatch(/@anonymized\.invalid$/);
    expect(customer.anonymizedAt).not.toBeNull();

    const kept = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true, contract: true },
    });
    expect(kept).toMatchObject({
      status: "COMPLETED",
      deliveryAddress: null,
      manageTokenHash: null,
    });
    expect(kept.payments).toHaveLength(1);
    expect(kept.contract).toMatchObject({ signerName: null, signatureStorageKey: null });
    const pdf = await db.document.findUniqueOrThrow({ where: { id: pdfId } });
    expect(pdf.deleteAfter?.getUTCFullYear()).toBe(2026 + CONTRACT_RETENTION_YEARS);

    expect(files.has(pdfKey)).toBe(true);
    expect(files.has(signatureKey)).toBe(false);
    expect(files.has(licenseKey)).toBe(false);
    expect(await db.document.count({ where: { ownerType: "CUSTOMER" } })).toBe(0);
    expect(await db.review.count()).toBe(0);
    expect(await db.message.findFirstOrThrow()).toMatchObject({
      name: null,
      email: null,
      body: "[slettet]",
    });

    const closed = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(closed.email).toMatch(/@anonymized\.invalid$/);
    expect(closed.disabledAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

    expect(await failure(anonymizeCustomer(manager, fleet.customer.id))).toMatchObject({
      code: "CONFLICT",
      details: { reason: "DONE" },
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "customer.anonymize" } }),
    ).toMatchObject({ entityId: fleet.customer.id, diff: { self: false, documents: 1 } });
  });

  it("blokerer ved aktiv booking eller uafklaret depositum/skade", async () => {
    const upcoming = await db.booking.create({
      data: bookingData(fleet, fleet.carA.id, "2099-03-02T10:00:00Z", "2099-03-04T10:00:00Z"),
    });
    expect(await anonymizeBlocker(fleet.customer.id)).toBe("ACTIVE_BOOKING");
    expect(await failure(anonymizeCustomer(manager, fleet.customer.id))).toMatchObject({
      details: { reason: "ACTIVE_BOOKING" },
    });
    await db.booking.update({
      where: { id: upcoming.id },
      data: { status: "COMPLETED", depositStatus: "HELD" },
    });
    expect(await anonymizeBlocker(fleet.customer.id)).toBe("OPEN_CLAIM");
    await db.booking.update({ where: { id: upcoming.id }, data: { depositStatus: "RELEASED" } });
    await db.damage.create({
      data: {
        carId: fleet.carA.id,
        bookingId: upcoming.id,
        area: "front-left",
        severity: "MINOR",
        origin: "NEW",
        description: "Ridse",
      },
    });
    expect(await anonymizeBlocker(fleet.customer.id)).toBe("OPEN_CLAIM");
    await db.damage.updateMany({ data: { liability: "CUSTOMER" } });
    expect(await anonymizeBlocker(fleet.customer.id)).toBeNull();
  });

  it("kunden sletter selv sin konto; personalet kan ikke slette sig selv herfra", async () => {
    const { user } = await customerWithHistory();
    expect((await failure(deleteOwnAccount(staff.actor!.userId))).code).toBe("FORBIDDEN");
    await deleteOwnAccount(user.id);
    expect(
      (await db.customer.findUniqueOrThrow({ where: { id: fleet.customer.id } })).anonymizedAt,
    ).not.toBeNull();
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "customer.anonymize" } }),
    ).toMatchObject({ actorUserId: user.id, diff: { self: true } });

    // Konto uden bookinger: kun login lukkes.
    const lonely = await db.user.create({
      data: { email: "solo@example.com", name: "Solo", emailVerified: true },
    });
    expect(await exportOwnData(lonely.id)).toMatchObject({
      account: { email: "solo@example.com" },
    });
    await deleteOwnAccount(lonely.id);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: lonely.id } })).disabledAt,
    ).not.toBeNull();
  });
});

describe("samtykker og retention", () => {
  it("samtykkeloggen tilføjer kun ændringer", async () => {
    const user = await db.user.create({
      data: { email: "ny@example.com", name: "Ny Kunde", emailVerified: true },
    });
    const who = { userId: user.id, email: user.email, name: user.name };
    expect(await accountConsents(user.id)).toMatchObject({ marketing: false, whatsapp: false });
    await setAccountConsents(who, { marketing: "on", whatsapp: "" });
    await setAccountConsents(who, { marketing: "on", whatsapp: "" });
    expect(await accountConsents(user.id)).toMatchObject({ marketing: true, whatsapp: false });
    await setAccountConsents(who, { whatsapp: "on" });
    expect(await accountConsents(user.id)).toMatchObject({ marketing: false, whatsapp: true });
    const rows = await db.consent.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((row) => `${row.purpose}:${row.granted}`)).toEqual([
      "MARKETING:true",
      "MARKETING:false",
      "WHATSAPP_MESSAGES:true",
    ]);
    expect(rows[0]).toMatchObject({ source: "account", policyVersion: "1" });

    await logCookieConsent({
      id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      analytics: true,
      marketing: false,
    });
    expect(
      await db.consent.count({ where: { anonymousId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b" } }),
    ).toBe(2);
    expect((await failure(logCookieConsent({ id: "x", analytics: "ja" }))).code).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("retention sletter dokumenter efter fristen og udløbne sessioner", async () => {
    const { pdfId, pdfKey, user, booking } = await customerWithHistory();
    await db.document.update({
      where: { id: pdfId },
      data: { deleteAfter: new Date("2026-01-01T00:00:00Z") },
    });
    await db.session.create({
      data: { userId: user.id, token: "old", expiresAt: new Date("2026-01-01T00:00:00Z") },
    });
    const result = await runRetention(new Date("2026-06-01T00:00:00Z"));
    expect(result).toMatchObject({ documents: 1, sessions: 1 });
    expect(files.has(pdfKey)).toBe(false);
    expect(await db.document.count({ where: { id: pdfId } })).toBe(0);
    expect(await db.contract.findUniqueOrThrow({ where: { bookingId: booking.id } })).toMatchObject(
      { pdfDocumentId: null },
    );
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  });
});
