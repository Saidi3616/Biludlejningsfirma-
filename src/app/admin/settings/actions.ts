"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { SiteSettingsField } from "@/lib/validation/settings";
import { updateSettings } from "@/server/admin/settings";
import { getPolicyContext } from "@/server/auth/session";

const SETTINGS_FIELDS = [
  "phone",
  "email",
  "whatsappNumber",
  "address",
] as const satisfies readonly SiteSettingsField[];

export type SettingsFormState = {
  error?: "invalid" | "forbidden" | "failed";
  fields?: string[];
  values?: Partial<Record<(typeof SETTINGS_FIELDS)[number], string>>;
};

export async function updateSettingsAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = Object.fromEntries(
    SETTINGS_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof SETTINGS_FIELDS)[number], string>;
  try {
    await updateSettings(await getPolicyContext(), values);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") {
      return { error: "invalid", fields: (error.details?.fields as string[]) ?? [], values };
    }
    if (
      error instanceof AppError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED")
    ) {
      return { error: "forbidden", values };
    }
    logger.error({ err: error }, "settings form failed");
    return { error: "failed", values };
  }
  // Kontaktoplysningerne står i sidehoved og -fod på alle offentlige sider.
  revalidatePath("/[locale]", "layout");
  redirect("/admin/settings?notice=saved");
}
