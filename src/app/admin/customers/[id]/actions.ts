"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getPolicyContext } from "@/server/auth/session";
import { anonymizeCustomer } from "@/server/gdpr/service";

/** Anonymisér kunden (F10). Kræver et afkrydset bekræftelsesfelt. */
export async function anonymizeCustomerAction(formData: FormData) {
  const id = String(formData.get("customerId") ?? "");
  const back = (notice: string) => `/admin/customers/${encodeURIComponent(id)}?notice=${notice}`;
  if (formData.get("confirm") !== "on") redirect(back("confirm"));
  let notice = "anonymized";
  try {
    await anonymizeCustomer(await getPolicyContext(), id);
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") notice = "forbidden";
    else if (error instanceof AppError && error.code === "CONFLICT") {
      notice = error.details?.reason === "DONE" ? "anonymized" : "blocked";
    } else {
      logger.error({ err: error }, "anonymize failed");
      notice = "failed";
    }
  }
  redirect(back(notice));
}
