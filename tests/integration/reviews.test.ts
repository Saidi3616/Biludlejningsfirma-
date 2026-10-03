import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { listReviews, setReviewStatus } from "@/server/admin/reviews";
import type { PolicyContext } from "@/server/auth/policies";
import {
  generateReference,
  referenceFromReviewToken,
  reviewTokenFor,
} from "@/server/booking/tokens";
import { publishedReviews } from "@/server/catalog/service";
import { db } from "@/server/db";
import { reviewContext, submitReview } from "@/server/reviews/service";
import { bookingData, createFleet, resetDb } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let manager: PolicyContext;
let staff: PolicyContext;

async function actor(role: Role, email: string): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email, name: role, role, emailVerified: true },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("forventede en fejl");
}

async function booking(status: "COMPLETED" | "CONFIRMED", day: number) {
  const from = `2026-0${day}-01T10:00:00Z`;
  const to = `2026-0${day}-03T10:00:00Z`;
  return db.booking.create({
    data: {
      ...bookingData(fleet, fleet.carA.id, from, to, { status }),
      reference: generateReference(),
    },
  });
}

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  manager = await actor("MANAGER", "leder@example.com");
  staff = await actor("STAFF", "medarbejder@example.com");
});

describe("anmeldelser (E8)", () => {
  it("linket er bundet til bookingen og kan ikke forfalskes", async () => {
    const done = await booking("COMPLETED", 1);
    const token = reviewTokenFor(done.reference);
    expect(referenceFromReviewToken(token)).toBe(done.reference);
    expect(referenceFromReviewToken(`${done.reference}.${"0".repeat(64)}`)).toBeNull();
    expect(referenceFromReviewToken("BK-ANDEN." + token.split(".").pop())).toBeNull();
    expect(referenceFromReviewToken("noget-andet")).toBeNull();
    expect(await reviewContext("noget-andet")).toEqual({ state: "invalid" });
    expect(await reviewContext(token)).toEqual({
      state: "open",
      carName: "Test Model",
      displayName: "Anna J.",
    });
  });

  it("kun gennemførte lejer, én gang, og teksten valideres", async () => {
    const upcoming = await booking("CONFIRMED", 2);
    const notYet = reviewTokenFor(upcoming.reference);
    expect(await reviewContext(notYet)).toEqual({ state: "notCompleted" });
    expect(
      await failure(submitReview(notYet, { rating: "5", displayName: "Anna J." })),
    ).toMatchObject({ code: "CONFLICT", details: { reason: "NOT_COMPLETED" } });

    const done = await booking("COMPLETED", 1);
    const token = reviewTokenFor(done.reference);
    expect(await failure(submitReview(token, { rating: "6", displayName: "A" }))).toMatchObject({
      code: "VALIDATION_FAILED",
      details: { fields: ["rating", "displayName"] },
    });

    await submitReview(token, { rating: "4", comment: "  Fin bil  ", displayName: "Anna J." });
    const saved = await db.review.findUniqueOrThrow({ where: { bookingId: done.id } });
    expect(saved).toMatchObject({
      rating: 4,
      comment: "Fin bil",
      displayName: "Anna J.",
      status: "PENDING",
      customerId: fleet.customer.id,
    });
    expect(await reviewContext(token)).toEqual({ state: "done" });
    expect(
      await failure(submitReview(token, { rating: "5", displayName: "Anna J." })),
    ).toMatchObject({ code: "CONFLICT", details: { reason: "DONE" } });

    // Afventende anmeldelser vises ikke offentligt.
    expect((await publishedReviews(10)).count).toBe(0);
  });

  it("lederen publicerer og skjuler; medarbejdere kan ikke", async () => {
    const done = await booking("COMPLETED", 1);
    await submitReview(reviewTokenFor(done.reference), {
      rating: "5",
      comment: "",
      displayName: "Anna J.",
    });
    const pending = await listReviews(manager);
    expect(pending.counts).toEqual({ PENDING: 1, PUBLISHED: 0, HIDDEN: 0 });
    const review = pending.reviews[0]!;
    expect(review).toMatchObject({ reference: done.reference, comment: null, rating: 5 });

    expect((await failure(listReviews(staff))).code).toBe("FORBIDDEN");
    expect((await failure(setReviewStatus(staff, review.id, "PUBLISHED"))).code).toBe("FORBIDDEN");
    expect(await failure(setReviewStatus(manager, review.id, "PENDING"))).toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect((await failure(setReviewStatus(manager, "x", "PUBLISHED"))).code).toBe("NOT_FOUND");

    await setReviewStatus(manager, review.id, "PUBLISHED");
    const published = await publishedReviews(10);
    expect(published).toMatchObject({ count: 1, average: 5 });
    expect(published.reviews[0]).toMatchObject({ displayName: "Anna J." });

    await setReviewStatus(manager, review.id, "HIDDEN");
    expect((await publishedReviews(10)).count).toBe(0);
    expect((await listReviews(manager, "HIDDEN")).reviews).toHaveLength(1);

    const actions = await db.auditLog.findMany({
      where: { entityType: "Review", entityId: review.id },
      orderBy: { createdAt: "asc" },
      select: { diff: true },
    });
    expect(actions.map((entry) => entry.diff)).toEqual([
      { from: "PENDING", to: "PUBLISHED" },
      { from: "PUBLISHED", to: "HIDDEN" },
    ]);
  });
});
