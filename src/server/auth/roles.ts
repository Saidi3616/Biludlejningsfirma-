import type { Role } from "@/generated/prisma/enums";

/** Roller fra laveste til højeste adgang til admin. Kunder har ingen admin-adgang. */
const staffRank: Record<Role, number> = {
  CUSTOMER: 0,
  STAFF: 1,
  MANAGER: 2,
  SUPER_ADMIN: 3,
};

export const roles = ["CUSTOMER", "STAFF", "MANAGER", "SUPER_ADMIN"] as const satisfies Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}

/** Har rollen mindst samme adgang som `minimum`? */
export function hasRoleAtLeast(role: Role, minimum: Exclude<Role, "CUSTOMER">): boolean {
  return staffRank[role] >= staffRank[minimum];
}

export function isStaff(role: Role): boolean {
  return hasRoleAtLeast(role, "STAFF");
}

/** MANAGER og SUPER_ADMIN skal have 2FA slået til, før de får admin-adgang (06-admin-flows F11). */
export function requiresTwoFactor(role: Role): boolean {
  return hasRoleAtLeast(role, "MANAGER");
}
