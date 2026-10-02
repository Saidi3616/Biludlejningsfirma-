import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { listAuditLog } from "@/server/admin/audit-log";
import { audit } from "@/server/audit";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { bookingData, createFleet, resetDb } from "./helpers";

async function actor(role: Role, email: string): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email, name: `Navn ${role}`, role, emailVerified: true },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

beforeEach(resetDb);

describe("audit-log i admin (M15)", () => {
  it("viser hændelser med filtre og links, kun for ledere", async () => {
    const fleet = await createFleet();
    const manager = await actor("MANAGER", "leder@example.com");
    const staff = await actor("STAFF", "medarbejder@example.com");
    const booking = await db.booking.create({
      data: bookingData(fleet, fleet.carA.id, "2026-11-01T09:00:00Z", "2026-11-03T09:00:00Z"),
    });
    await audit(db, {
      actorUserId: staff.actor!.userId,
      action: "booking.cancel",
      entityType: "Booking",
      entityId: booking.id,
      diff: { reason: "kunde" },
    });
    await audit(db, {
      actorUserId: null,
      action: "customer.anonymize",
      entityType: "Customer",
      entityId: fleet.customer.id,
    });

    const all = await listAuditLog(manager, {});
    expect(all.total).toBe(2);
    expect(all.entityTypes).toEqual(["Booking", "Customer"]);
    expect(all.rows[0]).toMatchObject({
      action: "customer.anonymize",
      actor: null,
      href: `/admin/customers/${fleet.customer.id}`,
    });
    expect(all.rows[1]).toMatchObject({
      action: "booking.cancel",
      actor: { name: "Navn STAFF", role: "STAFF" },
      href: `/admin/bookings/${booking.reference}`,
      diff: { reason: "kunde" },
    });

    expect((await listAuditLog(manager, { action: "booking." })).total).toBe(1);
    expect((await listAuditLog(manager, { entity: "Customer" })).total).toBe(1);

    await expect(listAuditLog(staff, {})).rejects.toBeInstanceOf(AppError);
  });
});
