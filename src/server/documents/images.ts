import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { DocumentKind, DocumentOwnerType, Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** Største fil, serveren tager imod. Browseren skalerer fotos ned før upload. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ACCEPTED = new Set(["jpeg", "png", "webp", "heif", "avif"]);

/**
 * Læser et billede og gemmer det igen som WebP: drejet efter EXIF, højst `maxSize` pixel og
 * uden metadata (GPS-position, kamera, tidspunkt fjernes). Alt, der ikke er et foto, afvises.
 */
export async function normalizePhoto(bytes: Uint8Array, maxSize: number) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError("VALIDATION_FAILED", "Filen er for stor eller tom", { reason: "TOO_LARGE" });
  }
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 100_000_000 });
    const { format } = await image.metadata();
    if (!format || !ACCEPTED.has(format)) throw new Error(`format ${format}`);
    const body = await image
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { body: new Uint8Array(body), mimeType: "image/webp", extension: "webp" };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_FAILED", "Filen er ikke et billede", { reason: "NOT_IMAGE" });
  }
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/**
 * Privat foto til en inspektion eller skade. Filen gemmes først; fejler databasen, slettes
 * filen igen, så der ikke ligger forældreløse billeder.
 */
export async function storePrivatePhoto(params: {
  ownerType: Extract<DocumentOwnerType, "INSPECTION" | "DAMAGE">;
  ownerId: string;
  kind?: DocumentKind;
  bytes: Uint8Array;
  onCreated?: (tx: Prisma.TransactionClient, documentId: string) => Promise<void>;
}) {
  const photo = await normalizePhoto(params.bytes, 2000);
  const key = `private/${params.ownerType.toLowerCase()}/${params.ownerId}/${randomUUID()}.${photo.extension}`;
  await storage().put(key, photo.body, photo.mimeType);
  try {
    return await db.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          ownerType: params.ownerType,
          ownerId: params.ownerId,
          kind: params.kind ?? "PHOTO",
          storageKey: key,
          mimeType: photo.mimeType,
          sizeBytes: photo.body.byteLength,
          sha256: sha256(photo.body),
        },
        select: { id: true },
      });
      await params.onCreated?.(tx, document.id);
      return document;
    });
  } catch (error) {
    await storage()
      .delete(key)
      .catch((cleanup) => logger.error({ err: cleanup }, "photo cleanup failed"));
    throw error;
  }
}

/** Offentligt bilbillede til kataloget (bredere, men samme rensning). */
export async function storePublicModelImage(carModelId: string, bytes: Uint8Array) {
  const photo = await normalizePhoto(bytes, 1600);
  const key = `public/models/${carModelId}/${randomUUID()}.${photo.extension}`;
  await storage().put(key, photo.body, photo.mimeType);
  return key;
}
