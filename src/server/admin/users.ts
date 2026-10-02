import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { localizedPath } from "@/i18n/paths";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { inviteSchema, roleSchema } from "@/lib/validation/users";
import { parseInput } from "@/lib/validation/parse";
import { authBaseUrl } from "@/server/auth/auth";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { violatedConstraint } from "@/server/db-errors";
import { authEmail } from "@/server/email/auth-emails";
import { sendEmail } from "@/server/email/send";
import type { Prisma } from "@/generated/prisma/client";

/** Invitationslinket virker i 72 timer. */
export const INVITE_HOURS = 72;

/** Better Auths nulstillingslink sætter et password, også når brugeren ikke har et endnu. */
const RESET_PREFIX = "reset-password:";

function assertId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Brugeren findes ikke");
}

const staffWhere = { role: { not: "CUSTOMER" } } satisfies Prisma.UserWhereInput;

const staffSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  disabledAt: true,
  createdAt: true,
  accounts: { where: { providerId: "credential" }, select: { id: true } },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

/** Inviteret = har endnu ikke valgt et password. */
function staffStatus(user: StaffRow): "active" | "invited" | "disabled" {
  if (user.disabledAt) return "disabled";
  return user.accounts.length === 0 ? "invited" : "active";
}

function staffView({ accounts: _accounts, ...user }: StaffRow) {
  return { ...user, status: staffStatus({ ...user, accounts: _accounts }) };
}

/** Medarbejdere (F11): rolle, 2FA, seneste login og status. Kun SUPER_ADMIN. */
export async function listStaff(ctx: PolicyContext) {
  assertCan(ctx, "users:manage");
  const users = await db.user.findMany({
    where: staffWhere,
    orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: staffSelect,
  });
  return users.map(staffView);
}

export async function staffUser(ctx: PolicyContext, userId: string) {
  assertCan(ctx, "users:manage");
  assertId(userId);
  const user = await db.user.findFirst({
    where: { id: userId, ...staffWhere },
    select: staffSelect,
  });
  if (!user) throw new AppError("NOT_FOUND", "Brugeren findes ikke");
  return { ...staffView(user), isSelf: user.id === ctx.actor!.userId };
}

export type StaffUser = Awaited<ReturnType<typeof staffUser>>;

/** Nyt engangslink; tidligere invitationslinks for brugeren holder op med at virke. */
async function createInviteToken(tx: Prisma.TransactionClient, userId: string) {
  await tx.verification.deleteMany({
    where: { value: userId, identifier: { startsWith: RESET_PREFIX } },
  });
  const token = randomBytes(18).toString("base64url");
  await tx.verification.create({
    data: {
      identifier: `${RESET_PREFIX}${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + INVITE_HOURS * 3_600_000),
    },
  });
  return token;
}

/** Sender invitationen. En fejl stopper ikke invitationen: den kan sendes igen fra listen. */
async function sendInvite(user: { email: string; name: string }, token: string) {
  const url = `${authBaseUrl()}${localizedPath("da", `/reset-password/${token}`)}`;
  try {
    await sendEmail(authEmail("invite", { to: user.email, name: user.name, url, locale: "da" }));
    return true;
  } catch (error) {
    logger.error({ err: error }, "invitation not sent");
    return false;
  }
}

/**
 * Invitér en medarbejder (F11). Brugeren oprettes med rollen og vælger selv password via linket i
 * e-mailen; MANAGER og SUPER_ADMIN skal derefter slå 2FA til, før de får adgang.
 * E-mailen regnes som bekræftet, fordi linket kun kan bruges fra den.
 */
export async function inviteStaff(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "users:manage");
  const values = parseInput(inviteSchema, input);
  let created: { id: string; token: string };
  try {
    created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: values.name,
          email: values.email,
          role: values.role,
          emailVerified: true,
          locale: "da",
        },
        select: { id: true },
      });
      const token = await createInviteToken(tx, user.id);
      await audit(tx, {
        actorUserId: ctx.actor!.userId,
        action: "user.invite",
        entityType: "User",
        entityId: user.id,
        diff: { role: values.role },
      });
      return { id: user.id, token };
    });
  } catch (error) {
    if (violatedConstraint(error) === "User_email_key") {
      throw new AppError("VALIDATION_FAILED", "E-mailen har allerede en konto", {
        fields: ["email"],
        reason: "DUPLICATE",
      });
    }
    throw error;
  }
  const emailSent = await sendInvite(values, created.token);
  return { id: created.id, emailSent };
}

/** Send invitationen igen (nyt link), så længe brugeren ikke har valgt password. */
export async function resendInvite(ctx: PolicyContext, userId: string) {
  const user = await staffUser(ctx, userId);
  if (user.status !== "invited") {
    throw new AppError("CONFLICT", "Brugeren er ikke inviteret", { reason: "NOT_INVITED" });
  }
  const token = await db.$transaction(async (tx) => {
    const token = await createInviteToken(tx, userId);
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "user.reinvite",
      entityType: "User",
      entityId: userId,
    });
    return token;
  });
  return { emailSent: await sendInvite(user, token) };
}

/** Der skal altid være mindst én aktiv SUPER_ADMIN, ellers kan ingen administrere brugere. */
async function assertNotLastSuperAdmin(tx: Prisma.TransactionClient, userId: string) {
  const others = await tx.user.count({
    where: { role: "SUPER_ADMIN", disabledAt: null, id: { not: userId } },
  });
  if (others === 0) {
    throw new AppError("CONFLICT", "Den sidste administrator kan ikke fjernes", {
      reason: "LAST_SUPER_ADMIN",
    });
  }
}

function assertNotSelf(ctx: PolicyContext, userId: string) {
  if (ctx.actor!.userId === userId) {
    throw new AppError("CONFLICT", "Du kan ikke ændre din egen adgang", { reason: "SELF" });
  }
}

/** Skift rolle. Gælder straks, fordi rollen læses fra databasen ved hver forespørgsel. */
export async function changeRole(
  ctx: PolicyContext,
  userId: string,
  input: Record<string, unknown>,
) {
  const user = await staffUser(ctx, userId);
  assertNotSelf(ctx, userId);
  const { role } = parseInput(roleSchema, input);
  if (role === user.role) return;
  await db.$transaction(async (tx) => {
    if (user.role === "SUPER_ADMIN") await assertNotLastSuperAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { role } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "user.role",
      entityType: "User",
      entityId: userId,
      diff: { from: user.role, to: role },
    });
  });
}

/** Deaktivér: alle sessioner lukkes straks, og nye logins afvises (se auth.ts). */
export async function disableStaff(ctx: PolicyContext, userId: string) {
  const user = await staffUser(ctx, userId);
  assertNotSelf(ctx, userId);
  if (user.disabledAt) return;
  await db.$transaction(async (tx) => {
    if (user.role === "SUPER_ADMIN") await assertNotLastSuperAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
    const sessions = await tx.session.deleteMany({ where: { userId } });
    // Et ubrugt invitationslink må heller ikke kunne bruges.
    await tx.verification.deleteMany({
      where: { value: userId, identifier: { startsWith: RESET_PREFIX } },
    });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "user.disable",
      entityType: "User",
      entityId: userId,
      diff: { sessionsClosed: sessions.count },
    });
  });
}

/** Genaktivér en deaktiveret medarbejder. Brugeren logger ind med sit gamle password. */
export async function enableStaff(ctx: PolicyContext, userId: string) {
  const user = await staffUser(ctx, userId);
  if (!user.disabledAt) return;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { disabledAt: null } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "user.enable",
      entityType: "User",
      entityId: userId,
    });
  });
}
