"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendCustomerMessage } from "@/server/admin/messages";
import { getPolicyContext } from "@/server/auth/session";
import { db } from "@/server/db";

export type MessageState = {
  status?: "sent" | "error";
  fields?: string[];
  values?: { subject: string; body: string };
};

export async function sendMessageAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const reference = String(formData.get("reference") ?? "");
  const values = {
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
  try {
    const ctx = await getPolicyContext();
    const booking = await db.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!booking) return { status: "error", values };
    await sendCustomerMessage(ctx, { bookingId: booking.id }, values);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") {
      return { status: "error", fields: (error.details?.fields as string[]) ?? [], values };
    }
    logger.error({ err: error }, "admin message failed");
    return { status: "error", values };
  }
  revalidatePath(`/admin/bookings/${reference}`);
  return { status: "sent" };
}
