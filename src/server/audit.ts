import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

type Client = Prisma.TransactionClient | typeof db;

/**
 * Audit-log for admin-handlinger (03-database-erd.md). `diff` beskriver ændringen uden
 * persondata ud over id'er; fritekst fra kunder eller beskeder logges ikke.
 */
export async function audit(
  client: Client,
  entry: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    diff?: Prisma.InputJsonValue;
  },
) {
  await client.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      diff: entry.diff,
    },
  });
}
