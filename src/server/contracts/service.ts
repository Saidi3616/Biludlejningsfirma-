import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { signContractSchema } from "@/lib/validation/contracts";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { appSecret } from "@/server/secrets";
import { storage } from "@/server/storage";
import { renderContractPdf } from "./pdf";
import { buildContractSnapshot, type ContractSnapshot } from "./snapshot";

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

function assertId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
}

/** IP-adressen gemmes ikke; kun en nøglet hash, der kan bekræfte en adresse senere (R19). */
export function hashSignerIp(ip: string) {
  return createHmac("sha256", appSecret()).update(`contract-ip:${ip}`).digest("hex");
}

const contractSelect = {
  id: true,
  signerName: true,
  signedAt: true,
  pdfDocumentId: true,
} satisfies Prisma.ContractSelect;

/** Kontraktens status til bookingsiden og underskriftssiden (F1, 06-admin-flows #6). */
export async function contractContext(ctx: PolicyContext, bookingId: string) {
  assertCan(ctx, "booking:read");
  assertId(bookingId);
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      status: true,
      pickupLocation: { select: { timezone: true } },
      customer: { select: { firstName: true, lastName: true } },
      contract: { select: contractSelect },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
  return booking;
}

export type ContractContext = Awaited<ReturnType<typeof contractContext>>;

/**
 * Tjekker, at underskriften er en rigtig PNG med en streg i, og gemmer den igen uden metadata
 * på hvid baggrund. Et tomt felt (ensfarvet billede) afvises.
 */
async function normalizeSignature(dataUrl: string) {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 4_000_000 });
    const { format, width = 0, height = 0 } = await image.metadata();
    if (format !== "png" || width < 50 || height < 20) throw new Error("not a signature");
    const flat = image.flatten({ background: "#ffffff" });
    const stats = await flat.clone().stats();
    if (stats.channels.every((channel) => channel.min === channel.max)) {
      throw new AppError("VALIDATION_FAILED", "Underskriften mangler", {
        fields: ["signature"],
        reason: "SIGNATURE_MISSING",
      });
    }
    const png = await flat
      .resize({ width: 800, height: 300, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return new Uint8Array(png);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_FAILED", "Underskriften kan ikke læses", {
      fields: ["signature"],
    });
  }
}

/**
 * Kunden underskriver lejekontrakten på personalets skærm ved udleveringen (F1). Vilkår og priser
 * fastfryses som snapshot, PDF'en laves og gemmes privat med SHA-256, og navn, tidspunkt og
 * IP-hash gemmes (12-risici R19). Kan kun ske én gang, før bilen udleveres.
 */
export async function signContract(
  ctx: PolicyContext,
  bookingId: string,
  input: Record<string, unknown>,
  meta: { ip: string },
  now = new Date(),
) {
  assertCan(ctx, "booking:write");
  const values = parseInput(signContractSchema, input);
  const booking = await contractContext(ctx, bookingId);
  if (booking.status !== "CONFIRMED") {
    throw new AppError("CONFLICT", "Kontrakten kan ikke underskrives nu", { from: booking.status });
  }
  if (booking.contract?.signedAt) {
    throw new AppError("CONFLICT", "Kontrakten er allerede underskrevet", { reason: "SIGNED" });
  }
  const signature = await normalizeSignature(values.signature);
  const snapshot = await buildContractSnapshot(bookingId);
  const pdf = await renderContractPdf(snapshot, {
    name: values.signerName,
    signedAt: now,
    image: signature,
  });

  const contractId = booking.contract?.id ?? randomUUID();
  const signatureKey = `private/contract/${contractId}/signature-${randomUUID()}.png`;
  const pdfKey = `private/contract/${contractId}/${randomUUID()}.pdf`;
  await storage().put(signatureKey, signature, "image/png");
  try {
    await storage().put(pdfKey, pdf, "application/pdf");
    const actorUserId = ctx.actor!.userId;
    return await db.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          ownerType: "CONTRACT",
          ownerId: contractId,
          kind: "CONTRACT_PDF",
          storageKey: pdfKey,
          mimeType: "application/pdf",
          sizeBytes: pdf.byteLength,
          sha256: sha256(pdf),
        },
        select: { id: true, sha256: true },
      });
      const data = {
        termsSnapshot: snapshot satisfies ContractSnapshot as Prisma.InputJsonObject,
        signerName: values.signerName,
        signedAt: now,
        signedIpHash: hashSignerIp(meta.ip),
        signatureStorageKey: signatureKey,
        pdfDocumentId: document.id,
      };
      if (booking.contract) {
        const updated = await tx.contract.updateMany({
          where: { id: contractId, signedAt: null },
          data,
        });
        if (updated.count === 0) {
          throw new AppError("CONFLICT", "Kontrakten er allerede underskrevet", {
            reason: "SIGNED",
          });
        }
      } else {
        await tx.contract.create({ data: { id: contractId, bookingId, ...data } });
      }
      await audit(tx, {
        actorUserId,
        action: "contract.sign",
        entityType: "Booking",
        entityId: bookingId,
        diff: {
          contractId,
          documentId: document.id,
          termsVersion: snapshot.termsVersion,
          sha256: document.sha256,
        },
      });
      return { contractId, documentId: document.id };
    });
  } catch (error) {
    await Promise.all(
      [signatureKey, pdfKey].map((key) =>
        storage()
          .delete(key)
          .catch((cleanup) => logger.error({ err: cleanup }, "contract cleanup failed")),
      ),
    );
    // To underskrifter på samme tid: den anden rammer den unikke booking-kontrakt.
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new AppError("CONFLICT", "Kontrakten er allerede underskrevet", { reason: "SIGNED" });
    }
    throw error;
  }
}

/** Kontraktens PDF for en booking, som kunden selv har adgang til (`findAccessibleBooking`). */
export async function signedContractDocument(bookingId: string) {
  const contract = await db.contract.findUnique({
    where: { bookingId },
    select: {
      signedAt: true,
      pdfDocument: { select: { storageKey: true, mimeType: true } },
    },
  });
  if (!contract?.signedAt || !contract.pdfDocument) return null;
  return contract.pdfDocument;
}

/**
 * Kontrakten som PDF til personalet: den gemte, underskrevne fil, eller en forhåndsvisning uden
 * underskrift med de aktuelle vilkår og priser, så den kan gennemgås med kunden først.
 */
export async function staffContractPdf(ctx: PolicyContext, bookingId: string) {
  const booking = await contractContext(ctx, bookingId);
  const document = booking.contract?.signedAt ? await signedContractDocument(bookingId) : null;
  if (document) {
    const object = await storage().get(document.storageKey);
    if (!object) throw new AppError("NOT_FOUND", "Kontrakten findes ikke");
    return { body: object.body, signed: true, reference: booking.reference };
  }
  const body = await renderContractPdf(await buildContractSnapshot(bookingId), null);
  return { body, signed: false, reference: booking.reference };
}
