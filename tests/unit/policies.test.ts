import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import {
  adminPermissionList,
  assertCan,
  can,
  type AdminPermission,
  type Actor,
} from "@/server/auth/policies";
import { AppError } from "@/lib/errors";

function actor(role: Role, twoFactorEnabled = true): Actor {
  return { userId: `user-${role}`, role, twoFactorEnabled };
}

/** Adgangsmatricen fra docs/architecture/04-sitemap.md, skrevet ud pr. rolle. */
const expected: Record<Exclude<Role, "CUSTOMER">, AdminPermission[]> = {
  STAFF: [
    "admin:access",
    "booking:read",
    "customer:read",
    "booking:write",
    "inspection:write",
    "damage:write",
    "message:send",
    "booking:requestCancel",
    "fleet:read",
    "fleet:setStatus",
  ],
  MANAGER: adminPermissionList.filter((p) => p !== "users:manage" && p !== "settings:write"),
  SUPER_ADMIN: adminPermissionList,
};

describe("adgangsmatrix", () => {
  for (const role of ["STAFF", "MANAGER", "SUPER_ADMIN"] as const) {
    describe(role, () => {
      it.each(adminPermissionList)("%s", (permission) => {
        expect(can({ actor: actor(role) }, permission)).toBe(expected[role].includes(permission));
      });
    });
  }

  it("STAFF kan ikke annullere, refundere, se statistik eller ændre priser", () => {
    const ctx = { actor: actor("STAFF") };
    for (const permission of [
      "booking:cancel",
      "payment:refund",
      "stats:read",
      "catalog:write",
      "car:readPurchasePrice",
      "audit:read",
      "users:manage",
    ] as const) {
      expect(can(ctx, permission)).toBe(false);
    }
  });

  it("kunder har ingen admin-adgang", () => {
    for (const permission of adminPermissionList) {
      expect(can({ actor: actor("CUSTOMER") }, permission)).toBe(false);
    }
  });

  it("ikke logget ind har ingen adgang", () => {
    expect(can({ actor: null }, "admin:access")).toBe(false);
    expect(can({ actor: null }, "account:access")).toBe(false);
  });
});

describe("2FA for ledere", () => {
  it("MANAGER og SUPER_ADMIN uden 2FA har ingen admin-adgang", () => {
    for (const role of ["MANAGER", "SUPER_ADMIN"] as const) {
      for (const permission of adminPermissionList) {
        expect(can({ actor: actor(role, false) }, permission)).toBe(false);
      }
    }
  });

  it("STAFF har adgang uden 2FA", () => {
    expect(can({ actor: actor("STAFF", false) }, "booking:read")).toBe(true);
  });
});

describe("kundens egne data", () => {
  const customer = actor("CUSTOMER");

  it("kunden har adgang til /account; medarbejdere har ikke", () => {
    expect(can({ actor: customer }, "account:access")).toBe(true);
    expect(can({ actor: actor("STAFF") }, "account:access")).toBe(false);
  });

  it("kunden kan kun se sine egne bookinger", () => {
    expect(can({ actor: customer }, "booking:readOwn", { ownerUserId: customer.userId })).toBe(
      true,
    );
    expect(can({ actor: customer }, "booking:readOwn", { ownerUserId: "someone-else" })).toBe(
      false,
    );
    expect(can({ actor: customer }, "booking:readOwn", { ownerUserId: null })).toBe(false);
    expect(can({ actor: customer }, "booking:readOwn")).toBe(false);
  });
});

describe("assertCan", () => {
  it("kaster UNAUTHENTICATED uden login og FORBIDDEN uden adgang", () => {
    const codeOf = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        return (error as AppError).code;
      }
      return null;
    };
    expect(codeOf(() => assertCan({ actor: null }, "booking:read"))).toBe("UNAUTHENTICATED");
    expect(codeOf(() => assertCan({ actor: actor("STAFF") }, "payment:refund"))).toBe("FORBIDDEN");
    expect(codeOf(() => assertCan({ actor: actor("MANAGER") }, "payment:refund"))).toBeNull();
  });
});
