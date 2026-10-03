"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getPolicyContext } from "@/server/auth/session";
import { db } from "@/server/db";
import { recordManualDeposit } from "@/server/payments/deposits";
import { simulateDeposit } from "@/server/payments/simulate";

function errorNotice(error: unknown) {
  if (error instanceof AppError) {
    if (error.code === "VALIDATION_FAILED") return "invalid";
    if (error.code === "CONFLICT") return "conflict";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return "forbidden";
  }
  logger.error({ err: error }, "deposit action failed");
  return "failed";
}

async function depositAction(
  formData: FormData,
  run: (bookingId: string) => Promise<unknown>,
): Promise<never> {
  const reference = String(formData.get("reference") ?? "").toUpperCase();
  if (!/^[A-Z0-9-]{1,40}$/.test(reference)) redirect("/admin/bookings");
  let notice: string;
  try {
    const booking = await db.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    await run(booking.id);
    notice = "held";
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/bookings");
    notice = errorNotice(error);
  }
  revalidatePath(`/admin/bookings/${reference}`);
  redirect(`/admin/bookings/${reference}/deposit?notice=${notice}`);
}

/** Depositum modtaget kontant eller på terminalen. */
export async function manualDepositAction(formData: FormData) {
  await depositAction(formData, async (bookingId) =>
    recordManualDeposit(await getPolicyContext(), bookingId, {
      method: String(formData.get("method") ?? ""),
    }),
  );
}

/** Kun lokalt og i CI: som hvis kunden havde godkendt kortet. */
export async function simulateDepositAction(formData: FormData) {
  await depositAction(formData, async (bookingId) =>
    simulateDeposit(await getPolicyContext(), bookingId),
  );
}
