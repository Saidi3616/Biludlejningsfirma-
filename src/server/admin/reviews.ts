import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { reviewStatusSchema } from "@/lib/validation/reviews";
import { assertCan, type PolicyContext } from "@/server/auth/policies";
import { audit } from "@/server/audit";
import { db } from "@/server/db";

type ReviewStatus = z.infer<typeof reviewStatusSchema>;

/** Anmeldelser til moderation, nyeste først, med antal pr. status. */
export async function listReviews(ctx: PolicyContext, status: ReviewStatus = "PENDING") {
  assertCan(ctx, "review:moderate");
  const [reviews, counts] = await Promise.all([
    db.review.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        rating: true,
        comment: true,
        displayName: true,
        status: true,
        createdAt: true,
        booking: { select: { reference: true } },
      },
    }),
    db.review.groupBy({ by: ["status"], _count: true }),
  ]);
  return {
    status,
    reviews: reviews.map(({ booking, ...review }) => ({ ...review, reference: booking.reference })),
    counts: Object.fromEntries(
      reviewStatusSchema.options.map((key) => [
        key,
        counts.find((row) => row.status === key)?._count ?? 0,
      ]),
    ) as Record<ReviewStatus, number>,
  };
}

/** Publicér eller skjul. Teksten ændres aldrig: kundens ord vises som skrevet eller slet ikke. */
export async function setReviewStatus(ctx: PolicyContext, reviewId: string, status: unknown) {
  assertCan(ctx, "review:moderate");
  if (!z.uuid().safeParse(reviewId).success) {
    throw new AppError("NOT_FOUND", "Anmeldelsen findes ikke");
  }
  const next = reviewStatusSchema.exclude(["PENDING"]).safeParse(status);
  if (!next.success)
    throw new AppError("VALIDATION_FAILED", "Ugyldig status", { fields: ["status"] });
  await db.$transaction(async (tx) => {
    const review = await tx.review.findUnique({
      where: { id: reviewId },
      select: { status: true },
    });
    if (!review) throw new AppError("NOT_FOUND", "Anmeldelsen findes ikke");
    if (review.status === next.data) return;
    await tx.review.update({ where: { id: reviewId }, data: { status: next.data } });
    await audit(tx, {
      actorUserId: ctx.actor!.userId,
      action: "review.status",
      entityType: "Review",
      entityId: reviewId,
      diff: { from: review.status, to: next.data },
    });
  });
}
