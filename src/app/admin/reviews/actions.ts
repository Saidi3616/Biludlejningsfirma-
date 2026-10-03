"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { setReviewStatus } from "@/server/admin/reviews";
import { getPolicyContext } from "@/server/auth/session";

/** Publicér eller skjul; listen og de offentlige sider genopbygges. */
export async function setReviewStatusAction(formData: FormData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const status = String(formData.get("status") ?? "");
  const from = String(formData.get("from") ?? "PENDING");
  let notice = status === "PUBLISHED" ? "published" : "hidden";
  try {
    await setReviewStatus(await getPolicyContext(), reviewId, status);
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") notice = "forbidden";
    else {
      if (!(error instanceof AppError)) logger.error({ err: error }, "review status failed");
      notice = "failed";
    }
  }
  revalidatePath("/admin/reviews");
  revalidatePath("/[locale]", "layout");
  redirect(`/admin/reviews?status=${encodeURIComponent(from)}&notice=${notice}`);
}
