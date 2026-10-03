"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { reassignCar, rescheduleBooking } from "@/server/admin/changes";
import { sendCustomerMessage } from "@/server/admin/messages";
import {
  adminCancelBooking,
  adminRefund,
  recordManualPayment,
  retryRefund,
} from "@/server/admin/payments";
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

/** Resultatet af en handling vises som en besked på bookingsiden (?notice=…). */
function errorNotice(error: unknown): string {
  if (error instanceof AppError) {
    if (error.code === "VALIDATION_FAILED") {
      return error.details?.reason === "TOO_SOON" ? "tooSoon" : "invalid";
    }
    if (error.code === "CAR_NO_LONGER_AVAILABLE") return "carTaken";
    if (error.code === "OUTSIDE_OPENING_HOURS") return "closed";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return "forbidden";
    if (error.code === "CONFLICT") return "conflict";
    if (error.code === "SERVICE_UNAVAILABLE") return "providerFailed";
  }
  logger.error({ err: error }, "admin booking action failed");
  return "failed";
}

async function runBookingAction(
  formData: FormData,
  run: (ctx: Awaited<ReturnType<typeof getPolicyContext>>, bookingId: string) => Promise<string>,
): Promise<never> {
  const reference = String(formData.get("reference") ?? "").toUpperCase();
  if (!/^[A-Z0-9-]{1,40}$/.test(reference)) redirect("/admin/bookings");
  let notice: string;
  try {
    const booking = await db.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    notice = await run(await getPolicyContext(), booking.id);
  } catch (error) {
    notice = errorNotice(error);
  }
  revalidatePath(`/admin/bookings/${reference}`);
  redirect(`/admin/bookings/${reference}?notice=${notice}`);
}

function fields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

export async function cancelAction(formData: FormData) {
  await runBookingAction(formData, async (ctx, bookingId) => {
    const result = await adminCancelBooking(
      ctx,
      bookingId,
      fields(formData, ["refund", "reason", "confirm"]),
    );
    return result.refundsFailed > 0 ? "cancelledRefundPending" : "cancelled";
  });
}

export async function refundAction(formData: FormData) {
  await runBookingAction(formData, async (ctx, bookingId) => {
    const result = await adminRefund(ctx, bookingId, fields(formData, ["amount", "reason"]));
    return result.refundsFailed > 0 ? "refundPending" : "refunded";
  });
}

export async function retryRefundAction(formData: FormData) {
  await runBookingAction(formData, async (ctx) => {
    await retryRefund(ctx, String(formData.get("paymentId") ?? ""));
    return "refunded";
  });
}

export async function manualPaymentAction(formData: FormData) {
  await runBookingAction(formData, async (ctx, bookingId) => {
    await recordManualPayment(ctx, bookingId, fields(formData, ["amount", "method"]));
    return "paid";
  });
}

export async function rescheduleAction(formData: FormData) {
  await runBookingAction(formData, async (ctx, bookingId) => {
    await rescheduleBooking(
      ctx,
      bookingId,
      fields(formData, ["pickupDate", "pickupTime", "returnDate", "returnTime", "price"]),
    );
    return "rescheduled";
  });
}

export async function reassignAction(formData: FormData) {
  await runBookingAction(formData, async (ctx, bookingId) => {
    await reassignCar(ctx, bookingId, fields(formData, ["carId"]));
    return "reassigned";
  });
}
