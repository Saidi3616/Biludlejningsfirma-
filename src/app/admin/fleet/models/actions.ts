"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { PhotoUploadResult } from "@/components/features/admin/photo-upload";
import {
  addModelImage,
  createModel,
  deleteModelImage,
  makeModelImageFirst,
  updateModel,
} from "@/server/admin/models";
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

export async function addModelImageAction(formData: FormData): Promise<PhotoUploadResult> {
  const modelId = String(formData.get("modelId") ?? "");
  try {
    const photo = formData.get("photo");
    if (!(photo instanceof Blob)) {
      throw new AppError("VALIDATION_FAILED", "Intet billede", { reason: "NOT_IMAGE" });
    }
    await addModelImage(
      await getPolicyContext(),
      modelId,
      new Uint8Array(await photo.arrayBuffer()),
    );
  } catch (error) {
    if (error instanceof AppError) {
      if (error.details?.reason === "TOO_LARGE") return { ok: false, error: "tooLarge" };
      if (error.details?.reason === "NOT_IMAGE") return { ok: false, error: "notImage" };
      if (error.details?.reason === "TOO_MANY") return { ok: false, error: "tooMany" };
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
        return { ok: false, error: "forbidden" };
      }
    }
    logger.error({ err: error }, "model image upload failed");
    return { ok: false, error: "failed" };
  }
  revalidateCatalog();
  revalidatePath(`/admin/fleet/models/${modelId}`);
  return { ok: true };
}

async function imageAction(
  formData: FormData,
  run: (ctx: Awaited<ReturnType<typeof getPolicyContext>>, imageId: string) => Promise<unknown>,
  success: string,
): Promise<never> {
  const modelId = String(formData.get("modelId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(modelId)) redirect("/admin/fleet/models");
  let notice = success;
  try {
    await run(await getPolicyContext(), String(formData.get("imageId") ?? ""));
  } catch (error) {
    if (!(error instanceof AppError)) logger.error({ err: error }, "model image action failed");
    notice = error instanceof AppError && error.code === "FORBIDDEN" ? "forbidden" : "failed";
  }
  revalidateCatalog();
  redirect(`/admin/fleet/models/${modelId}?notice=${notice}#images`);
}

export async function deleteModelImageAction(formData: FormData) {
  await imageAction(formData, deleteModelImage, "imageDeleted");
}

export async function firstModelImageAction(formData: FormData) {
  await imageAction(formData, makeModelImageFirst, "imageFirst");
}
