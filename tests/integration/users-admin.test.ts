import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import {
  changeRole,
  disableStaff,
  enableStaff,
  inviteStaff,
  listStaff,
  resendInvite,
  staffUser,
} from "@/server/admin/users";
import { getAuth } from "@/server/auth/auth";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { captureEmails, type Email } from "@/server/email/send";
import { resetDb } from "./helpers";

const BASE = "http://localhost:3000";
let outbox: Email[];
let admin: PolicyContext;
let manager: PolicyContext;
let ip = 0;

async function actor(role: Role, email: string): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email, name: role, role, emailVerified: true },
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

async function call(path: string, body: unknown) {
  ip += 1;
  return getAuth().handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE,
        "x-forwarded-for": `10.9.${Math.floor(ip / 250)}.${ip % 250}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Token fra invitationslinket (…/reset-password/<token>). */
function inviteToken(email: Email) {
  const url = email.text.match(/https?:\/\/\S+/)![0];
  return new URL(url).pathname.split("/").pop()!;
}

const invite = (overrides: Record<string, string> = {}) => ({
  name: "Mia Jensen",
  email: "Mia@Example.com",
  role: "STAFF",
  ...overrides,
});

beforeAll(() => {
  outbox = captureEmails();
});

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
  admin = await actor("SUPER_ADMIN", "admin@example.com");
  manager = await actor("MANAGER", "leder@example.com");
});

describe("brugere og roller (F11)", () => {
  it("inviterer en medarbejder, som vælger password via linket og kan logge ind", async () => {
    const { id, emailSent } = await inviteStaff(admin, invite());
    expect(emailSent).toBe(true);
    expect(await staffUser(admin, id)).toMatchObject({
      email: "mia@example.com",
      role: "STAFF",
      status: "invited",
      isSelf: false,
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      to: "mia@example.com",
      subject: "Du er inviteret til administrationen",
    });
    expect(outbox[0]!.text).toContain("/reset-password/");

    // Ny invitation: det gamle link holder op med at virke.
    const oldToken = inviteToken(outbox[0]!);
    await resendInvite(admin, id);
    const token = inviteToken(outbox[1]!);
    expect(token).not.toBe(oldToken);
    expect(
      (await call("/reset-password", { token: oldToken, newPassword: "x".repeat(12) })).status,
    ).toBe(400);

    const newPassword = "medarbejder-kode-123";
    expect((await call("/reset-password", { token, newPassword })).status).toBe(200);
    expect((await staffUser(admin, id)).status).toBe("active");
    const signIn = await call("/sign-in/email", {
      email: "mia@example.com",
      password: newPassword,
    });
    expect(signIn.status).toBe(200);
    expect(await db.session.count({ where: { userId: id } })).toBe(1);
    expect(await failure(resendInvite(admin, id))).toMatchObject({
      details: { reason: "NOT_INVITED" },
    });

    // Deaktivering lukker sessionen straks og afviser nye logins.
    await disableStaff(admin, id);
    expect(await db.session.count({ where: { userId: id } })).toBe(0);
    expect((await staffUser(admin, id)).status).toBe("disabled");
    const blocked = await call("/sign-in/email", {
      email: "mia@example.com",
      password: newPassword,
    });
    expect(blocked.status).toBe(403);
    await enableStaff(admin, id);
    const again = await call("/sign-in/email", { email: "mia@example.com", password: newPassword });
    expect(again.status).toBe(200);

    const actions = await db.auditLog.findMany({
      where: { entityType: "User", entityId: id },
      orderBy: { createdAt: "asc" },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action)).toEqual([
      "user.invite",
      "user.reinvite",
      "user.disable",
      "user.enable",
    ]);
  });

  it("afviser dobbelt e-mail og kunderolle", async () => {
    await inviteStaff(admin, invite());
    expect(await failure(inviteStaff(admin, invite({ email: "mia@example.com" })))).toMatchObject({
      details: { fields: ["email"], reason: "DUPLICATE" },
    });
    expect(
      await failure(inviteStaff(admin, invite({ email: "x@example.com", role: "CUSTOMER" }))),
    ).toMatchObject({
      details: { fields: ["role"] },
    });
  });

  it("skifter rolle, men aldrig sin egen eller den sidste administrators", async () => {
    const { id } = await inviteStaff(admin, invite());
    await changeRole(admin, id, { role: "MANAGER" });
    expect((await staffUser(admin, id)).role).toBe("MANAGER");

    expect(await failure(changeRole(admin, admin.actor!.userId, { role: "STAFF" }))).toMatchObject({
      details: { reason: "SELF" },
    });
    expect(await failure(disableStaff(admin, admin.actor!.userId))).toMatchObject({
      details: { reason: "SELF" },
    });

    // En anden administrator kan ikke fjerne den sidste aktive administrator.
    const other = await inviteStaff(
      admin,
      invite({ email: "anden@example.com", role: "SUPER_ADMIN" }),
    );
    const otherCtx: PolicyContext = {
      actor: { userId: other.id, role: "SUPER_ADMIN", twoFactorEnabled: true },
    };
    await disableStaff(admin, other.id);
    expect(
      await failure(changeRole(otherCtx, admin.actor!.userId, { role: "STAFF" })),
    ).toMatchObject({ details: { reason: "LAST_SUPER_ADMIN" } });

    // Deaktiverede sidst.
    const list = await listStaff(admin);
    expect(list.at(-1)).toMatchObject({ email: "anden@example.com", status: "disabled" });
    expect(list.map((user) => user.email).sort()).toEqual([
      "admin@example.com",
      "anden@example.com",
      "leder@example.com",
      "mia@example.com",
    ]);
  });

  it("kræver SUPER_ADMIN", async () => {
    expect((await failure(listStaff(manager))).code).toBe("FORBIDDEN");
    expect((await failure(inviteStaff(manager, invite()))).code).toBe("FORBIDDEN");
    expect(await db.user.count({ where: { email: "mia@example.com" } })).toBe(0);
  });
});
