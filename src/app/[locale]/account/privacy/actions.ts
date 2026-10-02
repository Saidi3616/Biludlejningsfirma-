"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/server/auth/session";
import { setAccountConsents } from "@/server/gdpr/consent";
import { deleteOwnAccount } from "@/server/gdpr/service";

export type ConsentState = { status?: "saved" | "error" };
export type DeleteState = {
  status?: "deleted" | "error" | "confirm";
  reason?: "ACTIVE_BOOKING" | "OPEN_CLAIM";
};

export async function saveConsentsAction(
  _previous: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER") return { status: "error" };
  try {
    await setAccountConsents(user, {
      marketing: formData.get("marketing") ?? "",
      whatsapp: formData.get("whatsapp") ?? "",
    });
  } catch (error) {
    logger.error({ err: error }, "consent update failed");
    return { status: "error" };
  }
  revalidatePath("/[locale]/account/privacy", "page");
  return { status: "saved" };
}

/** Sletning = anonymisering (E: /account/privacy). Kræver et afkrydset bekræftelsesfelt. */
export async function deleteAccountAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER") return { status: "error" };
  if (formData.get("confirm") !== "on") return { status: "confirm" };
  try {
    await deleteOwnAccount(user.userId);
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      const reason = error.details?.reason;
      if (reason === "ACTIVE_BOOKING" || reason === "OPEN_CLAIM")
        return { status: "error", reason };
    }
    logger.error({ err: error }, "account delete failed");
    return { status: "error" };
  }
  return { status: "deleted" };
}
