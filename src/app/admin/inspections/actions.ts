"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PhotoUploadResult } from "@/components/features/admin/photo-upload";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getPolicyContext } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  addDamage,
  addDamagePhoto,
  addInspectionPhoto,
  markDamageRepaired,
  pickUp,
  receiveReturn,
} from "@/server/inspections/service";

function fields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

/** Fejl som en kort kode til ?notice=… på siden, formularen kom fra. */
function errorNotice(error: unknown): string {
  if (error instanceof AppError) {
    const reason = error.details?.reason;
    if (reason === "ODOMETER_DOWN") return "odometerDown";
    if (reason === "UNPAID") return "unpaid";
    if (reason === "TOO_EARLY") return "tooEarly";
    if (reason === "DEPOSIT_MISSING") return "depositMissing";
    if (error.code === "VALIDATION_FAILED") return "invalid";
    if (error.code === "CONFLICT") return "conflict";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return "forbidden";
    if (error.code === "NOT_FOUND") return "notFound";
  }
  logger.error({ err: error }, "inspection action failed");
  return "failed";
}

async function handover(formData: FormData, type: "pickup" | "return"): Promise<never> {
  const reference = String(formData.get("reference") ?? "").toUpperCase();
  if (!/^[A-Z0-9-]{1,40}$/.test(reference)) redirect("/admin/bookings");
  let target: string;
  try {
    const booking = await db.booking.findUnique({ where: { reference }, select: { id: true } });
    if (!booking) throw new AppError("NOT_FOUND", "Bookingen findes ikke");
    const ctx = await getPolicyContext();
    const inspection =
      type === "pickup"
        ? await pickUp(ctx, booking.id, fields(formData, ["odometerKm", "fuelLevel", "notes"]))
        : await receiveReturn(
            ctx,
            booking.id,
            fields(formData, ["odometerKm", "fuelLevel", "notes", "carStatus"]),
          );
    target = `/admin/inspections/${inspection.id}?notice=${type === "pickup" ? "pickedUp" : "returned"}`;
  } catch (error) {
    target = `/admin/bookings/${reference}/${type}?notice=${errorNotice(error)}`;
  }
  revalidatePath(`/admin/bookings/${reference}`);
  redirect(target);
}

export async function pickupAction(formData: FormData) {
  await handover(formData, "pickup");
}

export async function returnAction(formData: FormData) {
  await handover(formData, "return");
}

function photoError(error: unknown): PhotoUploadResult {
  if (error instanceof AppError) {
    if (error.details?.reason === "TOO_LARGE") return { ok: false, error: "tooLarge" };
    if (error.details?.reason === "NOT_IMAGE") return { ok: false, error: "notImage" };
    if (error.details?.reason === "TOO_MANY") return { ok: false, error: "tooMany" };
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { ok: false, error: "forbidden" };
    }
  }
  logger.error({ err: error }, "photo upload failed");
  return { ok: false, error: "failed" };
}

async function photoBytes(formData: FormData) {
  const photo = formData.get("photo");
  if (!(photo instanceof Blob)) {
    throw new AppError("VALIDATION_FAILED", "Intet billede", { reason: "NOT_IMAGE" });
  }
  return new Uint8Array(await photo.arrayBuffer());
}

export async function inspectionPhotoAction(formData: FormData): Promise<PhotoUploadResult> {
  try {
    const inspectionId = String(formData.get("inspectionId") ?? "");
    await addInspectionPhoto(await getPolicyContext(), inspectionId, await photoBytes(formData));
    revalidatePath(`/admin/inspections/${inspectionId}`);
    return { ok: true };
  } catch (error) {
    return photoError(error);
  }
}

export async function damagePhotoAction(formData: FormData): Promise<PhotoUploadResult> {
  try {
    await addDamagePhoto(
      await getPolicyContext(),
      String(formData.get("damageId") ?? ""),
      await photoBytes(formData),
    );
    return { ok: true };
  } catch (error) {
    return photoError(error);
  }
}

export async function damageAction(formData: FormData) {
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!z.uuid().safeParse(inspectionId).success) redirect("/admin/bookings");
  let notice: string;
  try {
    await addDamage(
      await getPolicyContext(),
      inspectionId,
      fields(formData, ["area", "severity", "description", "liability", "estimatedCost"]),
    );
    notice = "damageAdded";
  } catch (error) {
    notice = errorNotice(error);
  }
  revalidatePath(`/admin/inspections/${inspectionId}`);
  redirect(`/admin/inspections/${inspectionId}?notice=${notice}#damages`);
}

/** Tilbage til siden, knappen stod på (bil eller inspektion). Kun stier i admin. */
function safeReturnTo(value: FormDataEntryValue | null) {
  const path = String(value ?? "");
  return /^\/admin\/(fleet\/cars|inspections)\/[0-9a-f-]{36}$/.test(path)
    ? path
    : "/admin/fleet/cars";
}

export async function damageRepairedAction(formData: FormData) {
  const returnTo = safeReturnTo(formData.get("returnTo"));
  let notice: string;
  try {
    await markDamageRepaired(await getPolicyContext(), String(formData.get("damageId") ?? ""));
    notice = "damageRepaired";
  } catch (error) {
    notice = errorNotice(error);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=${notice}`);
}
