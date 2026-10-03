"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { LocationField } from "@/lib/validation/catalog";
import {
  addSpecialDay,
  createLocation,
  removeDeliveryZone,
  removeSpecialDay,
  saveDeliveryZone,
  setWeeklyHours,
  updateLocation,
} from "@/server/admin/locations";
import { getPolicyContext } from "@/server/auth/session";

const LOCATION_FIELDS = [
  "name",
  "slug",
  "type",
  "address",
  "postalCode",
  "city",
  "country",
  "lat",
  "lng",
  "timezone",
  "phone",
  "whatsapp",
  "email",
  "bufferBeforeMinutes",
  "bufferAfterMinutes",
  "oneWayFee",
  "deliveryEnabled",
  "isActive",
] as const satisfies readonly LocationField[];

export type LocationFormState = {
  error?: "invalid" | "duplicate" | "forbidden" | "failed";
  fields?: string[];
  values?: Partial<Record<(typeof LOCATION_FIELDS)[number], string>>;
};

function locationValues(formData: FormData) {
  // Afkrydsningsfelter sendes kun, når de er sat; ellers tom tekst (= nej).
  return Object.fromEntries(
    LOCATION_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof LOCATION_FIELDS)[number], string>;
}

function formError(error: unknown, values: LocationFormState["values"]): LocationFormState {
  if (error instanceof AppError) {
    const fields = (error.details?.fields as string[] | undefined) ?? [];
    if (error.code === "VALIDATION_FAILED") {
      return {
        error: error.details?.reason === "DUPLICATE" ? "duplicate" : "invalid",
        fields,
        values,
      };
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { error: "forbidden", values };
    }
  }
  logger.error({ err: error }, "location form failed");
  return { error: "failed", values };
}

/** Lokationer vises i bookingflowet; siderne genopbygges, så ændringen ses med det samme. */
function revalidateLocations() {
  revalidatePath("/admin/locations", "layout");
  revalidatePath("/[locale]", "layout");
}

export async function createLocationAction(
  _previous: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const values = locationValues(formData);
  let id: string;
  try {
    ({ id } = (await createLocation(await getPolicyContext(), values))!);
  } catch (error) {
    return formError(error, values);
  }
  revalidateLocations();
  redirect(`/admin/locations/${id}?notice=created`);
}

export async function updateLocationAction(
  _previous: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const locationId = String(formData.get("locationId") ?? "");
  const values = locationValues(formData);
  try {
    await updateLocation(await getPolicyContext(), locationId, values);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/locations");
    return formError(error, values);
  }
  revalidateLocations();
  redirect(`/admin/locations/${locationId}?notice=saved`);
}

/** Kør en ændring på lokationens side og vend tilbage med en besked. */
async function onLocation(
  formData: FormData,
  success: string,
  invalid: string,
  run: (locationId: string) => Promise<unknown>,
) {
  const locationId = String(formData.get("locationId") ?? "");
  let notice = success;
  try {
    await run(locationId);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") notice = invalid;
    else if (error instanceof AppError && error.code === "FORBIDDEN") notice = "forbidden";
    else if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/locations");
    else {
      logger.error({ err: error }, "location change failed");
      notice = "failed";
    }
  }
  revalidateLocations();
  redirect(`/admin/locations/${locationId}?notice=${notice}`);
}

export async function setWeeklyHoursAction(formData: FormData) {
  const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    opensAt: String(formData.get(`opensAt-${weekday}`) ?? ""),
    closesAt: String(formData.get(`closesAt-${weekday}`) ?? ""),
    closed: formData.get(`closed-${weekday}`) === "on",
  }));
  const open24h = formData.get("open24h") === "on";
  await onLocation(formData, "hoursSaved", "hoursInvalid", async (locationId) =>
    setWeeklyHours(await getPolicyContext(), locationId, { days, open24h }),
  );
}

export async function addSpecialDayAction(formData: FormData) {
  const input = {
    date: String(formData.get("date") ?? ""),
    closed: String(formData.get("closed") ?? ""),
    opensAt: String(formData.get("opensAt") ?? ""),
    closesAt: String(formData.get("closesAt") ?? ""),
  };
  await onLocation(formData, "daySaved", "dayInvalid", async (locationId) =>
    addSpecialDay(await getPolicyContext(), locationId, input),
  );
}

export async function removeSpecialDayAction(formData: FormData) {
  const rowId = String(formData.get("rowId") ?? "");
  await onLocation(formData, "dayRemoved", "failed", async (locationId) =>
    removeSpecialDay(await getPolicyContext(), locationId, rowId),
  );
}

export async function saveDeliveryZoneAction(formData: FormData) {
  const input = {
    maxDistanceKm: String(formData.get("maxDistanceKm") ?? ""),
    fee: String(formData.get("fee") ?? ""),
  };
  await onLocation(formData, "zoneSaved", "zoneInvalid", async (locationId) =>
    saveDeliveryZone(await getPolicyContext(), locationId, input),
  );
}

export async function removeDeliveryZoneAction(formData: FormData) {
  const zoneId = String(formData.get("zoneId") ?? "");
  await onLocation(formData, "zoneRemoved", "failed", async (locationId) =>
    removeDeliveryZone(await getPolicyContext(), locationId, zoneId),
  );
}
