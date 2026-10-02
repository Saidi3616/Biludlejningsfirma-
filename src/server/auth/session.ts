import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "./auth";
import { can, type Actor, type Permission, type PolicyContext } from "./policies";
import { isRole, isStaff, requiresTwoFactor } from "./roles";

export type SessionUser = Actor & {
  name: string;
  email: string;
  locale: string;
};

/**
 * Data access layer for login: den eneste måde, sider og services finder den aktuelle bruger.
 * Slår sessionen op i databasen (ingen cookie-cache), så deaktivering virker med det samme.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const { user } = session;
  if (user.disabledAt || !isRole(user.role)) return null;
  return {
    userId: user.id,
    role: user.role,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    name: user.name,
    email: user.email,
    locale: user.locale ?? "da",
  };
});

export async function getPolicyContext(): Promise<PolicyContext> {
  return { actor: await getCurrentUser() };
}

/** Til kundesider (/account). Ikke logget ind → login; medarbejdere → admin. */
export async function requireCustomer(loginPath: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  if (isStaff(user.role)) redirect("/admin");
  return user;
}

/**
 * Til admin. Ikke logget ind → login; kunde → 404 (admin afsløres ikke). En leder uden 2FA sendes til
 * sikkerhedssiden, indtil 2FA er slået til (medmindre siden selv er sikkerhedssiden).
 */
export async function requireStaff(options: { allowMissingTwoFactor?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isStaff(user.role)) notFound();
  if (requiresTwoFactor(user.role) && !user.twoFactorEnabled && !options.allowMissingTwoFactor) {
    redirect("/admin/security");
  }
  return user;
}

/** Til admin-sider med en bestemt handling, fx `requirePermission("users:manage")`. Mangler adgang → 404. */
export async function requirePermission(permission: Permission) {
  const user = await requireStaff();
  if (!can({ actor: user }, permission)) notFound();
  return user;
}
