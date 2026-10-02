"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ExtraField } from "@/lib/validation/catalog";
import { createExtra, deleteExtra, updateExtra } from "@/server/admin/extras";
import { getPolicyContext } from "@/server/auth/session";

const EXTRA_FIELDS = [
  "code",
  "nameDa",
  "nameEn",
  "nameAr",
  "nameFr",
  "descriptionDa",
  "descriptionEn",
  "descriptionAr",
  "descriptionFr",
  "pricing",
  "price",
  "maxPrice",
  "maxQuantity",
  "stock",
  "sortOrder",
  "isActive",
] as const satisfies readonly ExtraField[];

export type ExtraFormState = {
  error?: "invalid" | "duplicate" | "forbidden" | "failed";
  fields?: string[];
  values?: Partial<Record<(typeof EXTRA_FIELDS)[number], string>>;
};

function extraValues(formData: FormData) {
  // Afkrydsningsfelter sendes kun, når de er sat; ellers tom tekst (= nej).
  return Object.fromEntries(
    EXTRA_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof EXTRA_FIELDS)[number], string>;
}

function formError(error: unknown, values: ExtraFormState["values"]): ExtraFormState {
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
  logger.error({ err: error }, "extra form failed");
  return { error: "failed", values };
}

/** Udstyret vises i bookingflowet; siderne genopbygges, så ændringen ses med det samme. */
function revalidateExtras() {
  revalidatePath("/admin/extras");
  revalidatePath("/[locale]", "layout");
}

export async function createExtraAction(
  _previous: ExtraFormState,
  formData: FormData,
): Promise<ExtraFormState> {
  const values = extraValues(formData);
  try {
    await createExtra(await getPolicyContext(), values);
  } catch (error) {
    return formError(error, values);
  }
  revalidateExtras();
  redirect("/admin/extras?notice=created");
}

export async function updateExtraAction(
  _previous: ExtraFormState,
  formData: FormData,
): Promise<ExtraFormState> {
  const extraId = String(formData.get("extraId") ?? "");
  const values = extraValues(formData);
  try {
    await updateExtra(await getPolicyContext(), extraId, values);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/extras");
    return formError(error, values);
  }
  revalidateExtras();
  redirect("/admin/extras?notice=saved");
}

export async function deleteExtraAction(formData: FormData) {
  const extraId = String(formData.get("extraId") ?? "");
  let notice = "deleted";
  try {
    await deleteExtra(await getPolicyContext(), extraId);
  } catch (error) {
    if (error instanceof AppError && error.details?.reason === "IN_USE") notice = "inUse";
    else if (error instanceof AppError && error.code === "FORBIDDEN") notice = "forbidden";
    else if (!(error instanceof AppError) || error.code !== "NOT_FOUND") {
      logger.error({ err: error }, "extra delete failed");
      notice = "failed";
    }
  }
  revalidateExtras();
  redirect(`/admin/extras?notice=${notice}`);
}
