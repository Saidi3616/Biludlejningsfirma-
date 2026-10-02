"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/server/auth/session";
import { updateProfile } from "@/server/account/service";

export type ProfileState = {
  status?: "saved" | "error";
  fields?: string[];
  values?: Record<string, string>;
};

const fields = ["firstName", "lastName", "phone", "locale"] as const;

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const values = Object.fromEntries(fields.map((name) => [name, String(formData.get(name) ?? "")]));
  const user = await getCurrentUser();
  if (!user) return { status: "error", values };
  try {
    await updateProfile(user, values);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") {
      const invalid = (error.details?.fields as string[] | undefined) ?? [];
      return { status: "error", fields: invalid, values };
    }
    logger.error({ err: error }, "profile update failed");
    return { status: "error", values };
  }
  revalidatePath("/[locale]/account", "layout");
  return { status: "saved", values };
}
