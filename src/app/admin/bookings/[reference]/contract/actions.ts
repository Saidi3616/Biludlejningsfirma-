"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getPolicyContext } from "@/server/auth/session";
import { signContract } from "@/server/contracts/service";
import { db } from "@/server/db";
import { clientIp } from "@/server/rate-limit";

function errorNotice(error: unknown) {
  if (error instanceof AppError) {
    if (error.details?.reason === "SIGNATURE_MISSING") return "signatureMissing";
    if (error.code === "VALIDATION_FAILED") {
      const fields = error.details?.fields;
      return Array.isArray(fields) && fields.includes("signature") ? "signatureMissing" : "invalid";
    }
    if (error.code === "CONFLICT") return "conflict";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return "forbidden";
  }
  logger.error({ err: error }, "contract sign failed");
  return "failed";
}

/** Kunden underskriver kontrakten på personalets skærm (F1). */
export async function signContractAction(formData: FormData) {
  const reference = String(formData.get("reference") ?? "").toUpperCase();
  if (!/^[A-Z0-9-]{1,40}$/.test(reference)) redirect("/admin/bookings");
  let notice: string;
  try {
    const booking = await db.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    await signContract(
      await getPolicyContext(),
      booking.id,
      {
        signerName: formData.get("signerName"),
        signature: formData.get("signature"),
        accept: formData.get("accept"),
      },
      { ip: clientIp(await headers()) },
    );
    notice = "signed";
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/bookings");
    notice = errorNotice(error);
  }
  revalidatePath(`/admin/bookings/${reference}`);
  redirect(`/admin/bookings/${reference}/contract?notice=${notice}`);
}
