import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { ADMIN_PAGE_SIZE } from "./bookings";

export const auditFilterSchema = z.object({
  /** Handling eller starten af den, fx "booking." eller "customer.anonymize". */
  action: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-zA-Z.]*$/)
    .optional()
    .catch(undefined),
  entity: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z]*$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

export type AuditFilter = z.infer<typeof auditFilterSchema>;

/** Audit-loggen, nyeste først (M15, MANAGER+). `diff` indeholder aldrig følsomme felter. */
export async function listAuditLog(ctx: PolicyContext, filter: AuditFilter) {
  assertCan(ctx, "audit:read");
  const page = filter.page ?? 1;
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    ...(filter.entity ? { entityType: filter.entity } : {}),
  };
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        diff: true,
        createdAt: true,
        actor: { select: { name: true, role: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      distinct: ["entityType"],
      orderBy: { entityType: "asc" },
      select: { entityType: true },
    }),
  ]);
  // Bookinger åbnes på deres reference.
  const bookingIds = rows.filter((row) => row.entityType === "Booking" && row.entityId);
  const references = new Map(
    (
      await db.booking.findMany({
        where: { id: { in: bookingIds.map((row) => row.entityId!) } },
        select: { id: true, reference: true },
      })
    ).map((booking) => [booking.id, booking.reference]),
  );
  return {
    rows: rows.map((row) => ({
      ...row,
      href:
        row.entityType === "Booking"
          ? references.has(row.entityId ?? "")
            ? `/admin/bookings/${references.get(row.entityId!)}`
            : null
          : auditEntityHref(row.entityType, row.entityId),
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    entityTypes: entities.map((row) => row.entityType),
  };
}

/** Link til det, en række handler om, hvor admin har en side for det. */
export function auditEntityHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case "Customer":
      return `/admin/customers/${entityId}`;
    case "User":
      return `/admin/users/${entityId}`;
    case "Car":
      return `/admin/fleet/cars/${entityId}`;
    case "CarModel":
      return `/admin/fleet/models/${entityId}`;
    case "Location":
      return `/admin/locations/${entityId}`;
    case "Discount":
      return `/admin/discounts/${entityId}`;
    case "Extra":
      return `/admin/extras/${entityId}`;
    default:
      return null;
  }
}
