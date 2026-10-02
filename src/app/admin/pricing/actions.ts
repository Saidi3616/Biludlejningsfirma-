"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { PricingRuleField } from "@/lib/validation/catalog";
import { createPricingRule, deletePricingRule, updatePricingRule } from "@/server/admin/pricing";
import { getPolicyContext } from "@/server/auth/session";

const RULE_FIELDS = [
  "categoryId",
  "carModelId",
  "minDays",
  "packagePrice",
  "perDayPrice",
  "validFrom",
  "validTo",
  "priority",
] as const satisfies readonly PricingRuleField[];

export type PricingRuleFormState = {
  error?: "invalid" | "forbidden" | "failed";
  fields?: string[];
  values?: Partial<Record<(typeof RULE_FIELDS)[number], string>>;
};

function ruleValues(formData: FormData) {
  return Object.fromEntries(
    RULE_FIELDS.map((name) => [name, String(formData.get(name) ?? "")]),
  ) as Record<(typeof RULE_FIELDS)[number], string>;
}

function formError(error: unknown, values: PricingRuleFormState["values"]): PricingRuleFormState {
  if (error instanceof AppError) {
    if (error.code === "VALIDATION_FAILED") {
      return { error: "invalid", fields: (error.details?.fields as string[]) ?? [], values };
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { error: "forbidden", values };
    }
  }
  logger.error({ err: error }, "pricing rule form failed");
  return { error: "failed", values };
}

/** Kataloget viser "fra"-priser; siderne genopbygges, så nye priser ses med det samme. */
function revalidatePrices() {
  revalidatePath("/admin/pricing");
  revalidatePath("/[locale]", "layout");
}

export async function createPricingRuleAction(
  _previous: PricingRuleFormState,
  formData: FormData,
): Promise<PricingRuleFormState> {
  const values = ruleValues(formData);
  let categoryId: string;
  try {
    ({ categoryId } = await createPricingRule(await getPolicyContext(), values));
  } catch (error) {
    return formError(error, values);
  }
  revalidatePrices();
  redirect(`/admin/pricing?category=${categoryId}&notice=created`);
}

export async function updatePricingRuleAction(
  _previous: PricingRuleFormState,
  formData: FormData,
): Promise<PricingRuleFormState> {
  const ruleId = String(formData.get("ruleId") ?? "");
  const values = ruleValues(formData);
  let categoryId: string;
  try {
    ({ categoryId } = await updatePricingRule(await getPolicyContext(), ruleId, values));
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") redirect("/admin/pricing");
    return formError(error, values);
  }
  revalidatePrices();
  redirect(`/admin/pricing?category=${categoryId}&notice=saved`);
}

export async function deletePricingRuleAction(formData: FormData) {
  const ruleId = String(formData.get("ruleId") ?? "");
  let target = "/admin/pricing?notice=failed";
  try {
    const { categoryId } = await deletePricingRule(await getPolicyContext(), ruleId);
    target = `/admin/pricing?category=${categoryId}&notice=deleted`;
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN")
      target = "/admin/pricing?notice=forbidden";
    else if (!(error instanceof AppError))
      logger.error({ err: error }, "pricing rule delete failed");
  }
  revalidatePrices();
  redirect(target);
}
