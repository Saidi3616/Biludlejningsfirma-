import "server-only";
import { siteSettingsSchema } from "@/lib/validation/settings";
import { parseInput } from "@/lib/validation/parse";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { getSiteContact } from "@/server/settings";

/** De nuværende firmaoplysninger til formularen (SUPER_ADMIN). */
export async function adminSettings(ctx: PolicyContext) {
  assertCan(ctx, "settings:write");
  return getSiteContact();
}

/** Gem firmaoplysningerne (SUPER_ADMIN). De vises på hjemmesiden, i kontrakter og beskeder. */
export async function updateSettings(ctx: PolicyContext, input: Record<string, unknown>) {
  assertCan(ctx, "settings:write");
  const data = parseInput(siteSettingsSchema, input);
  await db.$transaction(async (tx) => {
    const before = await tx.siteSettings.findUnique({ where: { id: 1 } });
    await tx.siteSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "settings.update",
      entityType: "SiteSettings",
      entityId: "1",
      // Kun hvilke felter der ændrede sig; firmaets egne oplysninger, ikke persondata.
      diff: {
        changed: (Object.keys(data) as (keyof typeof data)[]).filter(
          (key) => (before?.[key] ?? null) !== data[key],
        ),
      },
    });
  });
}
