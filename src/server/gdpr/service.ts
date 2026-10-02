import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/**
 * Underskrevne kontrakter gemmes i 5 år efter lejens afslutning (bogføringsloven, F10), også
 * efter anonymisering; derefter sletter retention-jobbet PDF'en. Afventer advokatens godkendelse.
 */
export const CONTRACT_RETENTION_YEARS = 5;

function assertCustomerId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Kunden findes ikke");
}

/** Alt, vi har gemt om kunden, som JSON (artikel 15 og 20). Dokumenterne listes uden indhold. */
async function collectCustomerData(customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phoneE164: true,
      addressLine: true,
      postalCode: true,
      city: true,
      country: true,
      licenseCountry: true,
      licenseIssuedAt: true,
      licenseExpiresAt: true,
      preferredLocale: true,
      anonymizedAt: true,
      createdAt: true,
      user: { select: { email: true, createdAt: true, lastLoginAt: true } },
      bookings: {
        orderBy: { createdAt: "asc" },
        select: {
          reference: true,
          status: true,
          paymentStatus: true,
          depositStatus: true,
          fulfilment: true,
          deliveryAddress: true,
          pickupAt: true,
          returnAt: true,
          subtotalMinor: true,
          discountMinor: true,
          totalMinor: true,
          depositMinor: true,
          currency: true,
          locale: true,
          termsVersion: true,
          createdAt: true,
          carModel: { select: { brand: true, model: true } },
          pickupLocation: { select: { name: true } },
          returnLocation: { select: { name: true } },
          items: {
            select: { labelSnapshot: true, quantity: true, totalMinor: true, currency: true },
          },
          payments: {
            orderBy: { createdAt: "asc" },
            select: {
              kind: true,
              status: true,
              method: true,
              amountMinor: true,
              currency: true,
              cardBrand: true,
              cardLast4: true,
              createdAt: true,
            },
          },
          contract: { select: { version: true, signerName: true, signedAt: true } },
        },
      },
      reviews: { select: { rating: true, comment: true, displayName: true, createdAt: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          channel: true,
          direction: true,
          subject: true,
          body: true,
          createdAt: true,
        },
      },
      consents: {
        orderBy: { createdAt: "asc" },
        select: {
          purpose: true,
          granted: true,
          policyVersion: true,
          source: true,
          createdAt: true,
        },
      },
    },
  });
  if (!customer) throw new AppError("NOT_FOUND", "Kunden findes ikke");
  const documents = await db.document.findMany({
    where: { ownerType: "CUSTOMER", ownerId: customerId },
    select: { kind: true, mimeType: true, sizeBytes: true, createdAt: true },
  });
  const { bookings, ...profile } = customer;
  return {
    exportedAt: new Date().toISOString(),
    note: "Beløb er i mindste enhed (øre) med valutakode. Dokumenter udleveres på anmodning.",
    profile,
    bookings: bookings.map((booking) => ({
      ...booking,
      car: `${booking.carModel.brand} ${booking.carModel.model}`,
      carModel: undefined,
      pickupLocation: booking.pickupLocation.name,
      returnLocation: booking.returnLocation.name,
    })),
    documents,
  };
}

export type CustomerExport = Awaited<ReturnType<typeof collectCustomerData>>;

/** Personalets eksport (F10, MANAGER+). Logges i audit-loggen. */
export async function exportCustomer(ctx: PolicyContext, customerId: string) {
  assertCan(ctx, "gdpr:export");
  assertCustomerId(customerId);
  const data = await collectCustomerData(customerId);
  await audit(db, {
    actorUserId: ctx.actor!.userId,
    action: "customer.export",
    entityType: "Customer",
    entityId: customerId,
  });
  return data;
}

/** Kundens egen eksport fra /account/privacy. */
export async function exportOwnData(userId: string) {
  const customer = await db.customer.findUnique({ where: { userId }, select: { id: true } });
  if (!customer) {
    // Konto uden bookinger: kun login-oplysningerne.
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, locale: true, createdAt: true, lastLoginAt: true },
    });
    return { exportedAt: new Date().toISOString(), account: user, bookings: [] };
  }
  const data = await collectCustomerData(customer.id);
  await audit(db, {
    actorUserId: userId,
    action: "customer.export",
    entityType: "Customer",
    entityId: customer.id,
    diff: { self: true },
  });
  return data;
}

/**
 * Hvorfor kunden ikke kan anonymiseres endnu (null = det kan den): en booking, der ikke er
 * afsluttet, et depositum, der stadig er reserveret, eller en skade uden afgjort ansvar.
 */
export async function anonymizeBlocker(customerId: string, now = new Date()) {
  const open = await db.booking.count({
    where: {
      customerId,
      OR: [
        { status: { in: ["CONFIRMED", "ACTIVE"] } },
        { status: "PENDING_PAYMENT", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
  });
  if (open > 0) return "ACTIVE_BOOKING" as const;
  const claims = await db.booking.count({
    where: {
      customerId,
      OR: [{ depositStatus: "HELD" }, { damages: { some: { liability: "UNDECIDED" } } }],
    },
  });
  return claims > 0 ? ("OPEN_CLAIM" as const) : null;
}

/**
 * Anonymisering = GDPR-sletning (F10, K: 13-konflikter). Navn, kontakt, kørekort, beskeder,
 * anmeldelser og dokumenter fjernes; bookinger og betalinger bevares under et pseudonym
 * (bogføringsloven). En evt. login-konto lukkes. Filer slettes efter transaktionen.
 */
async function anonymize(customerId: string, actorUserId: string, self: boolean, now: Date) {
  const blocker = await anonymizeBlocker(customerId, now);
  if (blocker) throw new AppError("CONFLICT", "Kunden kan ikke slettes endnu", { reason: blocker });

  const filesToDelete: string[] = [];
  await db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { userId: true, anonymizedAt: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "Kunden findes ikke");
    if (customer.anonymizedAt) {
      throw new AppError("CONFLICT", "Kunden er allerede anonymiseret", { reason: "DONE" });
    }

    await tx.customer.update({
      where: { id: customerId },
      data: {
        userId: null,
        firstName: "Anonym",
        lastName: "",
        email: `anonym-${customerId}@anonymized.invalid`,
        phoneE164: null,
        addressLine: null,
        postalCode: null,
        city: null,
        country: null,
        dateOfBirthEnc: null,
        licenseNumberEnc: null,
        licenseCountry: null,
        licenseIssuedAt: null,
        licenseExpiresAt: null,
        anonymizedAt: now,
      },
    });
    await tx.booking.updateMany({
      where: { customerId },
      data: { deliveryAddress: null, manageTokenHash: null },
    });
    await tx.message.updateMany({
      where: { customerId },
      data: { name: null, email: null, phone: null, subject: null, body: "[slettet]" },
    });
    await tx.notification.updateMany({ where: { customerId }, data: { payload: {} } });
    await tx.notification.updateMany({
      where: { customerId, status: "PENDING" },
      data: { status: "SKIPPED" },
    });
    await tx.review.deleteMany({ where: { customerId } });

    // Kundens egne dokumenter (kørekort, ID) slettes straks.
    const documents = await tx.document.findMany({
      where: { ownerType: "CUSTOMER", ownerId: customerId },
      select: { id: true, storageKey: true },
    });
    filesToDelete.push(...documents.map((document) => document.storageKey));
    await tx.document.deleteMany({ where: { id: { in: documents.map((d) => d.id) } } });

    // Kontrakter: navn og underskrift fjernes; PDF'en gemmes til retention-fristen.
    const contracts = await tx.contract.findMany({
      where: { booking: { customerId } },
      select: {
        id: true,
        signatureStorageKey: true,
        pdfDocumentId: true,
        booking: { select: { returnAt: true } },
      },
    });
    for (const contract of contracts) {
      if (contract.signatureStorageKey) filesToDelete.push(contract.signatureStorageKey);
      await tx.contract.update({
        where: { id: contract.id },
        data: { signerName: null, signatureStorageKey: null },
      });
      if (contract.pdfDocumentId) {
        const deleteAfter = new Date(contract.booking.returnAt);
        deleteAfter.setUTCFullYear(deleteAfter.getUTCFullYear() + CONTRACT_RETENTION_YEARS);
        await tx.document.update({ where: { id: contract.pdfDocumentId }, data: { deleteAfter } });
      }
    }

    if (customer.userId) {
      const userId = customer.userId;
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.twoFactor.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `slettet-${userId}@anonymized.invalid`,
          name: "Anonym",
          emailVerified: false,
          image: null,
          twoFactorEnabled: false,
          disabledAt: now,
        },
      });
    }

    await audit(tx, {
      actorUserId,
      action: "customer.anonymize",
      entityType: "Customer",
      entityId: customerId,
      diff: { self, documents: documents.length, contracts: contracts.length },
    });
  });

  for (const key of filesToDelete) {
    try {
      await storage().delete(key);
    } catch (error) {
      // Rækken er væk; filen er privat og findes ikke længere i nogen visning.
      logger.error({ err: error, customerId }, "gdpr file delete failed");
    }
  }
}

/** Personalets anonymisering (F10, MANAGER+). */
export async function anonymizeCustomer(ctx: PolicyContext, customerId: string, now = new Date()) {
  assertCan(ctx, "gdpr:anonymize");
  assertCustomerId(customerId);
  await anonymize(customerId, ctx.actor!.userId, false, now);
}

/** Kunden sletter sin konto fra /account/privacy. */
export async function deleteOwnAccount(userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  // Personalets konti lukkes af en administrator (F11), ikke herfra.
  if (user?.role !== "CUSTOMER") throw new AppError("FORBIDDEN", "Kun kundekonti");
  const customer = await db.customer.findUnique({ where: { userId }, select: { id: true } });
  if (customer) {
    await anonymize(customer.id, userId, true, now);
    return;
  }
  // Konto uden bookinger: kun login-kontoen lukkes.
  await db.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `slettet-${userId}@anonymized.invalid`,
        name: "Anonym",
        emailVerified: false,
        disabledAt: now,
      },
    });
    await audit(tx, {
      actorUserId: userId,
      action: "user.deleteSelf",
      entityType: "User",
      entityId: userId,
    });
  });
}
