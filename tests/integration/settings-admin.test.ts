import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { site } from "@/config/site";
import { AppError } from "@/lib/errors";
import { adminSettings, updateSettings } from "@/server/admin/settings";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { getSiteContact } from "@/server/settings";
import { resetDb } from "./helpers";

async function actor(role: Role): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email: `${role.toLowerCase()}@example.com`, name: role, role, emailVerified: true },
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

const input = {
  phone: " +45 12 34 56 78 ",
  email: "Kontakt@Firma.dk",
  whatsappNumber: "+45 12 34 56 78",
  address: "Testvej 1, 1000 København",
};

describe("firmaoplysninger (/admin/settings)", () => {
  let admin: PolicyContext;
  beforeEach(async () => {
    await resetDb();
    admin = await actor("SUPER_ADMIN");
  });

  it("uden gemte oplysninger bruges pladsholderne", async () => {
    expect(await getSiteContact()).toEqual({
      phone: site.phone,
      email: site.email,
      whatsappNumber: site.whatsappNumber,
      address: null,
    });
  });

  it("SUPER_ADMIN gemmer; WhatsApp bliver rene cifre, og ændringen auditeres", async () => {
    await updateSettings(admin, input);
    expect(await getSiteContact()).toEqual({
      phone: "+45 12 34 56 78",
      email: "kontakt@firma.dk",
      whatsappNumber: "4512345678",
      address: "Testvej 1, 1000 København",
    });
    expect(await adminSettings(admin)).toMatchObject({ whatsappNumber: "4512345678" });

    await updateSettings(admin, { ...input, address: "" });
    expect((await getSiteContact()).address).toBeNull();
    expect(await db.siteSettings.count()).toBe(1);

    const logs = await db.auditLog.findMany({
      where: { action: "settings.update" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((log) => log.diff)).toEqual([
      { changed: ["phone", "email", "whatsappNumber", "address"] },
      { changed: ["address"] },
    ]);
  });

  it("afviser ugyldige felter", async () => {
    const error = await failure(
      updateSettings(admin, { ...input, email: "ikke-en-mail", whatsappNumber: "12" }),
    );
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.details?.fields).toEqual(["email", "whatsappNumber"]);
    expect(await db.siteSettings.count()).toBe(0);
  });

  it("kun SUPER_ADMIN må se og ændre", async () => {
    const manager = await actor("MANAGER");
    expect((await failure(updateSettings(manager, input))).code).toBe("FORBIDDEN");
    expect((await failure(adminSettings(manager))).code).toBe("FORBIDDEN");
  });
});
