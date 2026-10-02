"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { DiscountField } from "@/lib/validation/catalog";
import { createDiscount, deleteDiscount, updateDiscount } from "@/server/admin/discounts";
import { getPolicyContext } from "@/server/auth/session";

const TEXT_FIELDS = [
  "code",
  "type",
  "value",
  "validFrom",
  "validTo",
  "minBooking",
  "minDays",
  "maxUses",
  "maxUsesPerCustomer",
  "isActive",
] as const satisfies readonly DiscountField[];

type TextField = (typeof TEXT_FIELDS)[number];

export type DiscountFormValues = Partial<Record<TextField, string>> & {
  categoryIds?: string[];
  carModelIds?: string[];
};

export type DiscountFormState = {
  error?: "invalid" | "duplicate" | "inUse" | "forbidden" | "failed";
  fields?: string[];
  values?: DiscountFormValues;
};

function discountValues(formData: FormData) {
  // Afkrydsningsfelter sendes kun, når de er sat; ellers tom tekst (= nej).
  const values = Object.fromEntries(
    TEXT_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<TextField, string>;
  return {
    ...values,
    categoryIds: formData.getAll("categoryIds").map(String),
    carModelIds: formData.getAll("carModelIds").map(String),
  };
}

function formError(error: unknown, values: DiscountFormValues): DiscountFormState {
  if (error instanceof AppError) {
    const fields = (error.details?.fields as string[] | undefined) ?? [];
    if (error.code === "VALIDATION_FAILED") {
      const reason = error.details?.reason;
      return {
        error: reason === "DUPLICATE" ? "duplicate" : reason === "IN_USE" ? "inUse" : "invalid",
        fields,
        values,
      };
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { error: "forbidden", values };
    }
  }
  logger.error({ err: error }, "discount form failed");
  return { error: "failed", values };
}

export async function createDiscountAction(
  _previous: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const values = discountValues(formData);
  try {
    await createDiscount(await getPolicyContext(), values);
  } catch (error) {
    return formError(error, values);
  }
  revalidatePath("/admin/discounts");
  redirect("/admin/discounts?notice=created");
}

export async function updateDiscountAction(
  _previous: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const discountId = String(formData.get("discountId") ?? "");
  const values = discountValues(formData);
  try {
    await updateDiscount(await getPolicyContext(), discountId, values);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/discounts");
    return formError(error, values);
  }
  revalidatePath("/admin/discounts");
  redirect("/admin/discounts?notice=saved");
}

export async function deleteDiscountAction(formData: FormData) {
  const discountId = String(formData.get("discountId") ?? "");
  let notice = "deleted";
  try {
    await deleteDiscount(await getPolicyContext(), discountId);
  } catch (error) {
    if (error instanceof AppError && error.details?.reason === "IN_USE") notice = "inUse";
    else if (error instanceof AppError && error.code === "FORBIDDEN") notice = "forbidden";
    else if (!(error instanceof AppError) || error.code !== "NOT_FOUND") {
      logger.error({ err: error }, "discount delete failed");
      notice = "failed";
    }
  }
  revalidatePath("/admin/discounts");
  redirect(`/admin/discounts?notice=${notice}`);
}
