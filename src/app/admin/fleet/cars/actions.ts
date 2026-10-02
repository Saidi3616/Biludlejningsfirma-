"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  addMaintenance,
  createCar,
  setCarStatus,
  setMaintenanceStatus,
  updateCar,
  updateOdometer,
} from "@/server/admin/fleet";
import { getPolicyContext } from "@/server/auth/session";

const CAR_FIELDS = [
  "carModelId",
  "homeLocationId",
  "registrationNumber",
  "vin",
  "color",
  "odometerKm",
  "purchaseDate",
  "purchasePrice",
  "insurancePolicy",
  "insuranceExpiresAt",
  "nextInspectionDue",
  "nextServiceDue",
  "nextServiceKm",
  "tyreType",
] as const;

export type CarFormState = {
  error?: "invalid" | "duplicate" | "odometerDown" | "hasBookings" | "forbidden" | "failed";
  fields?: string[];
  references?: string[];
  values?: Partial<Record<(typeof CAR_FIELDS)[number], string>>;
};

function carFormError(error: unknown, values: CarFormState["values"]): CarFormState {
  if (error instanceof AppError) {
    const fields = (error.details?.fields as string[] | undefined) ?? [];
    if (error.code === "VALIDATION_FAILED") {
      if (error.details?.reason === "DUPLICATE") return { error: "duplicate", fields, values };
      if (error.details?.reason === "ODOMETER_DOWN")
        return { error: "odometerDown", fields, values };
      return { error: "invalid", fields, values };
    }
    if (error.code === "CONFLICT" && error.details?.reason === "HAS_BOOKINGS") {
      return {
        error: "hasBookings",
        references: (error.details.references as string[] | undefined) ?? [],
        values,
      };
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { error: "forbidden", values };
    }
  }
  logger.error({ err: error }, "car form failed");
  return { error: "failed", values };
}

function carValues(formData: FormData) {
  return Object.fromEntries(
    CAR_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof CAR_FIELDS)[number], string>;
}

export async function createCarAction(
  _previous: CarFormState,
  formData: FormData,
): Promise<CarFormState> {
  const values = carValues(formData);
  let id: string;
  try {
    ({ id } = (await createCar(await getPolicyContext(), values))!);
  } catch (error) {
    return carFormError(error, values);
  }
  revalidatePath("/admin/fleet/cars");
  redirect(`/admin/fleet/cars/${id}?notice=created`);
}

export async function updateCarAction(
  _previous: CarFormState,
  formData: FormData,
): Promise<CarFormState> {
  const carId = String(formData.get("carId") ?? "");
  const values = carValues(formData);
  try {
    await updateCar(await getPolicyContext(), carId, values);
  } catch (error) {
    return carFormError(error, values);
  }
  revalidatePath(`/admin/fleet/cars/${carId}`);
  redirect(`/admin/fleet/cars/${carId}?notice=saved`);
}

/** Resultatet vises som en besked på bilens side (?notice=…&refs=…). */
function errorNotice(error: unknown): { notice: string; references?: string[] } {
  if (error instanceof AppError) {
    const references = error.details?.references as string[] | undefined;
    if (error.code === "VALIDATION_FAILED") {
      const fields = (error.details?.fields as string[] | undefined) ?? [];
      if (error.details?.reason === "ODOMETER_DOWN") return { notice: "odometerDown" };
      return { notice: fields.includes("endDate") ? "endBeforeStart" : "invalid" };
    }
    if (error.code === "CAR_NO_LONGER_AVAILABLE") return { notice: "bookingsInPeriod", references };
    if (error.code === "CONFLICT") {
      if (error.details?.reason === "RENTED") return { notice: "rented" };
      if (error.details?.reason === "HAS_BOOKINGS") return { notice: "hasBookings", references };
      if (error.details?.reason === "MAINTENANCE_OVERLAP") return { notice: "maintenanceOverlap" };
      return { notice: "conflict" };
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { notice: "forbidden" };
    }
    if (error.code === "NOT_FOUND") return { notice: "notFound" };
  }
  logger.error({ err: error }, "fleet action failed");
  return { notice: "failed" };
}

async function runCarAction(
  carId: string,
  run: (ctx: Awaited<ReturnType<typeof getPolicyContext>>) => Promise<string>,
): Promise<never> {
  if (!z.uuid().safeParse(carId).success) redirect("/admin/fleet/cars");
  let result: { notice: string; references?: string[] };
  try {
    result = { notice: await run(await getPolicyContext()) };
  } catch (error) {
    result = errorNotice(error);
  }
  revalidatePath(`/admin/fleet/cars/${carId}`);
  const query = new URLSearchParams({ notice: result.notice });
  if (result.references?.length) query.set("refs", result.references.slice(0, 20).join(","));
  redirect(`/admin/fleet/cars/${carId}?${query}`);
}

function fields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => [name, String(formData.get(name) ?? "")]));
}

export async function carStatusAction(formData: FormData) {
  const carId = String(formData.get("carId") ?? "");
  await runCarAction(carId, async (ctx) => {
    await setCarStatus(ctx, carId, {
      status: String(formData.get("status") ?? ""),
      ...(formData.get("confirm") ? { confirm: String(formData.get("confirm")) } : {}),
    });
    return "statusChanged";
  });
}

export async function odometerAction(formData: FormData) {
  const carId = String(formData.get("carId") ?? "");
  await runCarAction(carId, async (ctx) => {
    await updateOdometer(ctx, carId, fields(formData, ["odometerKm"]));
    return "odometerSaved";
  });
}

export async function maintenanceAction(formData: FormData) {
  const carId = String(formData.get("carId") ?? "");
  await runCarAction(carId, async (ctx) => {
    await addMaintenance(
      ctx,
      carId,
      fields(formData, [
        "type",
        "startDate",
        "startTime",
        "endDate",
        "endTime",
        "vendor",
        "notes",
        "cost",
      ]),
    );
    return "maintenanceAdded";
  });
}

export async function maintenanceStatusAction(formData: FormData) {
  const carId = String(formData.get("carId") ?? "");
  await runCarAction(carId, async (ctx) => {
    await setMaintenanceStatus(ctx, String(formData.get("maintenanceId") ?? ""), {
      status: String(formData.get("status") ?? ""),
    });
    return "maintenanceUpdated";
  });
}
