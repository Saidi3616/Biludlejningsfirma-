import "server-only";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** Rate-limit-rækker ældre end et døgn bruges ikke længere. */
const RATE_LIMIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

/**
 * Dagligt retention-job (07-api.md: /api/cron/retention): dokumenter efter `deleteAfter`,
 * udløbne sessioner, login-links og gamle rate-limit-rækker.
 */
export async function runRetention(now = new Date()) {
  const documents = await db.document.findMany({
    where: { deleteAfter: { lte: now } },
    take: BATCH,
    select: { id: true, storageKey: true },
  });
  let deletedDocuments = 0;
  for (const document of documents) {
    try {
      await storage().delete(document.storageKey);
      await db.$transaction([
        db.contract.updateMany({
          where: { pdfDocumentId: document.id },
          data: { pdfDocumentId: null },
        }),
        db.document.delete({ where: { id: document.id } }),
      ]);
      deletedDocuments += 1;
    } catch (error) {
      // Prøves igen i morgen.
      logger.error({ err: error, documentId: document.id }, "retention delete failed");
    }
  }
  const [sessions, verifications, rateLimits] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({
      where: { lastRequest: { lt: BigInt(now.getTime() - RATE_LIMIT_MAX_AGE_MS) } },
    }),
  ]);
  return {
    documents: deletedDocuments,
    sessions: sessions.count,
    verifications: verifications.count,
    rateLimits: rateLimits.count,
  };
}
