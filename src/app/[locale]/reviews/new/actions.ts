"use server";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ReviewField } from "@/lib/validation/reviews";
import { submitReview } from "@/server/reviews/service";

export type ReviewFormState = {
  done?: boolean;
  error?: "invalid" | "failed" | "closed";
  fields?: string[];
  values?: Partial<Record<ReviewField, string>>;
};

export async function submitReviewAction(
  _previous: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const token = String(formData.get("token") ?? "");
  const values = {
    rating: String(formData.get("rating") ?? ""),
    comment: String(formData.get("comment") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  };
  try {
    await submitReview(token, values);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") {
      return { error: "invalid", fields: (error.details?.fields as string[]) ?? [], values };
    }
    // Ugyldigt link, allerede anmeldt eller ikke afsluttet: siden genindlæses med forklaringen.
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "CONFLICT")) {
      return { error: "closed" };
    }
    logger.error({ err: error }, "review submit failed");
    return { error: "failed", values };
  }
  // Ingen revalidering: siden ville ellers skifte til "allerede anmeldt" i stedet for tak.
  return { done: true };
}
