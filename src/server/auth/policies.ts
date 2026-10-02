import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { hasRoleAtLeast, requiresTwoFactor } from "./roles";

/**
 * Hvem må hvad. Kilden er adgangsmatricen i docs/architecture/04-sitemap.md ("Adgang pr. rolle").
 * Services kalder `assertCan(ctx, ...)` før de læser eller ændrer data; UI bruger `can()` til at
 * skjule knapper. Middleware/proxy er aldrig eneste beskyttelse.
 */

export type Actor = {
  userId: string;
  role: Role;
  twoFactorEnabled: boolean;
};

/** `null` = ikke logget ind. */
export type PolicyContext = { actor: Actor | null };

type Minimum = Exclude<Role, "CUSTOMER">;

/** Admin-handlinger og den laveste rolle, der må udføre dem. */
const adminPermissions = {
  "admin:access": "STAFF",

  // Dashboard, kalender, bookinger, kunder (læs)
  "booking:read": "STAFF",
  "customer:read": "STAFF",
  // Opret/ændr booking, inspektioner, skader, beskeder
  "booking:write": "STAFF",
  "inspection:write": "STAFF",
  "damage:write": "STAFF",
  "message:send": "STAFF",
  // STAFF kan kun anmode om annullering; MANAGER+ udfører den
  "booking:requestCancel": "STAFF",
  "booking:cancel": "MANAGER",
  "payment:refund": "MANAGER",
  // Ansvar og beløb for skader ved afregningen
  "damage:approveCost": "MANAGER",
  // Flåde og service: STAFF læser og ændrer status, MANAGER+ ændrer alt
  "fleet:read": "STAFF",
  "fleet:setStatus": "STAFF",
  "fleet:write": "MANAGER",
  "car:readPurchasePrice": "MANAGER",
  // Priser, ekstraudstyr, rabatter, lokationer
  "catalog:write": "MANAGER",
  // Anmeldelser publiceres eller skjules af en leder (E8)
  "review:moderate": "MANAGER",
  "stats:read": "MANAGER",
  "audit:read": "MANAGER",
  "gdpr:export": "MANAGER",
  "gdpr:anonymize": "MANAGER",
  // Kun SUPER_ADMIN
  "users:manage": "SUPER_ADMIN",
  "settings:write": "SUPER_ADMIN",
} as const satisfies Record<string, Minimum>;

export type AdminPermission = keyof typeof adminPermissions;

export const adminPermissionList = Object.keys(adminPermissions) as AdminPermission[];

/** Kundehandlinger. `booking:readOwn` kræver, at bookingen tilhører kunden. */
type CustomerPermission = "account:access" | "booking:readOwn";

export type Permission = AdminPermission | CustomerPermission;

/** Det, policies skal vide om en booking for at afgøre ejerskab. */
export type OwnedResource = { ownerUserId: string | null };

export function minimumRole(permission: AdminPermission): Minimum {
  return adminPermissions[permission];
}

function isAdminPermission(permission: Permission): permission is AdminPermission {
  return permission in adminPermissions;
}

export function can(ctx: PolicyContext, permission: Permission, resource?: OwnedResource): boolean {
  const { actor } = ctx;
  if (!actor) return false;

  if (isAdminPermission(permission)) {
    if (!hasRoleAtLeast(actor.role, minimumRole(permission))) return false;
    // En leder uden 2FA har ingen admin-adgang, før 2FA er slået til.
    if (requiresTwoFactor(actor.role) && !actor.twoFactorEnabled) return false;
    return true;
  }

  if (actor.role !== "CUSTOMER") return false;
  switch (permission) {
    case "account:access":
      return true;
    case "booking:readOwn":
      return resource !== undefined && resource.ownerUserId === actor.userId;
  }
}

/** Som `can`, men kaster `UNAUTHENTICATED` eller `FORBIDDEN`. */
export function assertCan(
  ctx: PolicyContext,
  permission: Permission,
  resource?: OwnedResource,
): asserts ctx is { actor: Actor } {
  if (!ctx.actor) throw new AppError("UNAUTHENTICATED", "Login kræves");
  if (!can(ctx, permission, resource))
    throw new AppError("FORBIDDEN", `Mangler adgang: ${permission}`);
}
