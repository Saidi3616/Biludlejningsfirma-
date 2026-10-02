"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createModel, updateModel } from "@/server/admin/models";
import { getPolicyContext } from "@/server/auth/session";

const MODEL_FIELDS = [
  "categoryId",
  "slug",
  "brand",
  "model",
  "year",
  "transmission",
  "fuel",
  "seats",
  "bags",
  "doors",
  "airConditioning",
  "includedKmPerDay",
  "extraKmFee",
  "deposit",
  "descriptionDa",
  "descriptionEn",
  "descriptionAr",
  "descriptionFr",
  "isActive",
  "isFeatured",
] as const;

export type ModelFormState = {
  error?: "invalid" | "duplicate" | "forbidden" | "failed";
  fields?: string[];
  values?: Partial<Record<(typeof MODEL_FIELDS)[number], string>>;
};

function modelValues(formData: FormData) {
  // Afkrydsningsfelter sendes kun, når de er sat; ellers tom tekst (= nej).
  return Object.fromEntries(
    MODEL_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof MODEL_FIELDS)[number], string>;
}

function modelFormError(error: unknown, values: ModelFormState["values"]): ModelFormState {
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
  logger.error({ err: error }, "car model form failed");
  return { error: "failed", values };
}

/** Kataloget viser modeller; siderne genopbygges, så ændringen ses med det samme. */
function revalidateCatalog() {
  revalidatePath("/admin/fleet/models");
  revalidatePath("/[locale]", "layout");
}

export async function createModelAction(
  _previous: ModelFormState,
  formData: FormData,
): Promise<ModelFormState> {
  const values = modelValues(formData);
  try {
    await createModel(await getPolicyContext(), values);
  } catch (error) {
    return modelFormError(error, values);
  }
  revalidateCatalog();
  redirect("/admin/fleet/models?notice=created");
}

export async function updateModelAction(
  _previous: ModelFormState,
  formData: FormData,
): Promise<ModelFormState> {
  const modelId = String(formData.get("modelId") ?? "");
  const values = modelValues(formData);
  try {
    await updateModel(await getPolicyContext(), modelId, values);
  } catch (error) {
    return modelFormError(error, values);
  }
  revalidateCatalog();
  redirect("/admin/fleet/models?notice=saved");
}
