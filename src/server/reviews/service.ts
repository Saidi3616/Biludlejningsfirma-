import "server-only";
import { AppError } from "@/lib/errors";
import { reviewSchema } from "@/lib/validation/reviews";
import { parseInput } from "@/lib/validation/parse";
import { referenceFromReviewToken } from "@/server/booking/tokens";
import { db } from "@/server/db";
import { violatedConstraint } from "@/server/db-errors";

/** "Anna J." — fornavn og forbogstav i efternavnet, som kunden kan rette. */
export function defaultDisplayName(firstName: string, lastName: string) {
  const initial = lastName.trim().charAt(0).toUpperCase();
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim();
}

async function bookingForToken(token: string) {
  const reference = referenceFromReviewToken(token);
  if (!reference) return null;
  return db.booking.findUnique({
    where: { reference },
    select: {
      id: true,
      status: true,
      customerId: true,
      carModel: { select: { brand: true, model: true } },
      customer: { select: { firstName: true, lastName: true, anonymizedAt: true } },
      review: { select: { id: true } },
    },
  });
}

/**
 * Hvad anmeldelsessiden skal vise for et link. Kun gennemførte lejer kan anmeldes
 * (verificerede anmeldelser, K16), og kun én gang.
 */
export async function reviewContext(token: string) {
  const booking = await bookingForToken(token);
  if (!booking || booking.customer.anonymizedAt) return { state: "invalid" as const };
  if (booking.review) return { state: "done" as const };
  if (booking.status !== "COMPLETED") return { state: "notCompleted" as const };
  return {
    state: "open" as const,
    carName: `${booking.carModel.brand} ${booking.carModel.model}`,
    displayName: defaultDisplayName(booking.customer.firstName, booking.customer.lastName),
  };
}

/** Gem anmeldelsen som afventende; en medarbejder publicerer den (F: /admin/reviews). */
export async function submitReview(token: string, input: Record<string, unknown>) {
  const booking = await bookingForToken(token);
  if (!booking || booking.customer.anonymizedAt) {
    throw new AppError("NOT_FOUND", "Linket er ikke gyldigt");
  }
  if (booking.review) throw new AppError("CONFLICT", "Allerede anmeldt", { reason: "DONE" });
  if (booking.status !== "COMPLETED") {
    throw new AppError("CONFLICT", "Lejen er ikke afsluttet", { reason: "NOT_COMPLETED" });
  }
  const values = parseInput(reviewSchema, input);
  try {
    await db.review.create({
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        rating: values.rating,
        comment: values.comment,
        displayName: values.displayName,
      },
    });
  } catch (error) {
    // To samtidige indsendelser: den anden rammer den unikke booking.
    if (violatedConstraint(error) === "Review_bookingId_key") {
      throw new AppError("CONFLICT", "Allerede anmeldt", { reason: "DONE" });
    }
    throw error;
  }
}
