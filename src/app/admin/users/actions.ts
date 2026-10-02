"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { InviteField } from "@/lib/validation/users";
import {
  changeRole,
  disableStaff,
  enableStaff,
  inviteStaff,
  resendInvite,
} from "@/server/admin/users";
import { getPolicyContext } from "@/server/auth/session";

const INVITE_FIELDS = ["name", "email", "role"] as const satisfies readonly InviteField[];

export type InviteFormState = {
  error?: "invalid" | "duplicate" | "forbidden" | "failed";
  fields?: string[];
  values?: Partial<Record<InviteField, string>>;
};

export async function inviteStaffAction(
  _previous: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const values = Object.fromEntries(
    INVITE_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<InviteField, string>;
  let result: { id: string; emailSent: boolean };
  try {
    result = await inviteStaff(await getPolicyContext(), values);
  } catch (error) {
    if (error instanceof AppError) {
      const fields = (error.details?.fields as string[] | undefined) ?? [];
      if (error.code === "VALIDATION_FAILED") {
        const duplicate = error.details?.reason === "DUPLICATE";
        return { error: duplicate ? "duplicate" : "invalid", fields, values };
      }
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
        return { error: "forbidden", values };
      }
    }
    logger.error({ err: error }, "invite failed");
    return { error: "failed", values };
  }
  revalidatePath("/admin/users");
  redirect(`/admin/users/${result.id}?notice=${result.emailSent ? "invited" : "inviteNotSent"}`);
}

const REASONS: Record<string, string> = {
  SELF: "self",
  LAST_SUPER_ADMIN: "lastSuperAdmin",
  NOT_INVITED: "failed",
};

/** Kør en ændring på brugerens side og vend tilbage med en besked. */
async function onUser(
  formData: FormData,
  success: string,
  run: (userId: string) => Promise<string | void>,
) {
  const userId = String(formData.get("userId") ?? "");
  let notice = success;
  try {
    notice = (await run(userId)) ?? success;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/users");
    if (error instanceof AppError && error.code === "FORBIDDEN") notice = "forbidden";
    else if (error instanceof AppError && typeof error.details?.reason === "string") {
      notice = REASONS[error.details.reason] ?? "failed";
    } else {
      logger.error({ err: error }, "user change failed");
      notice = "failed";
    }
  }
  revalidatePath("/admin/users", "layout");
  redirect(`/admin/users/${userId}?notice=${notice}`);
}

export async function changeRoleAction(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  await onUser(formData, "roleSaved", async (userId) =>
    changeRole(await getPolicyContext(), userId, { role }),
  );
}

export async function resendInviteAction(formData: FormData) {
  await onUser(formData, "reinvited", async (userId) => {
    const { emailSent } = await resendInvite(await getPolicyContext(), userId);
    return emailSent ? "reinvited" : "inviteNotSent";
  });
}

export async function disableStaffAction(formData: FormData) {
  await onUser(formData, "disabled", async (userId) =>
    disableStaff(await getPolicyContext(), userId),
  );
}

export async function enableStaffAction(formData: FormData) {
  await onUser(formData, "enabled", async (userId) =>
    enableStaff(await getPolicyContext(), userId),
  );
}
