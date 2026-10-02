"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getPolicyContext } from "@/server/auth/session";
import { db } from "@/server/db";
import { settleBooking } from "@/server/payments/settlement";

function errorNotice(error: unknown) {
  if (error instanceof AppError) {
    if (error.code === "VALIDATION_FAILED") return "invalid";
    if (error.code === "CONFLICT") return "conflict";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return "forbidden";
    if (error.code === "SERVICE_UNAVAILABLE") return "provider";
  }
  logger.error({ err: error }, "settlement failed");
  return "failed";
}

/** Afregning efter aflevering: tillæg, skader og depositum (F2). */
export async function settleAction(formData: FormData) {
  const reference = String(formData.get("reference") ?? "").toUpperCase();
  if (!/^[A-Z0-9-]{1,40}$/.test(reference)) redirect("/admin/bookings");
  const value = (name: string) => String(formData.get(name) ?? "");
  let notice: string;
  try {
    const booking = await db.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    const damages = formData.getAll("damageId").map((entry) => {
      const id = String(entry);
      return { id, liability: value(`liability-${id}`), amount: value(`amount-${id}`) || "0" };
    });
    await settleBooking(await getPolicyContext(), booking.id, {
      extraKm: value("extraKm") || "0",
      fuel: value("fuel") || "0",
      late: value("late") || "0",
      damages,
    });
    notice = "settled";
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/bookings");
    notice = errorNotice(error);
  }
  revalidatePath(`/admin/bookings/${reference}`);
  redirect(`/admin/bookings/${reference}/settle?notice=${notice}`);
}
