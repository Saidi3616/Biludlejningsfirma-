import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Eye, EyeOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Rating } from "@/components/ui/rating";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { reviewStatusSchema } from "@/lib/validation/reviews";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { listReviews } from "@/server/admin/reviews";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { setReviewStatusAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.reviews" });
  return { title: t("title") };
}

const NOTICES = ["published", "hidden", "forbidden", "failed"] as const;

/** Moderation af anmeldelser (E8): afventende, publicerede og skjulte. */
export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  setRequestLocale("da");
  await requirePermission("review:moderate");
  const search = await searchParams;
  const status = reviewStatusSchema.safeParse(search.status).data ?? "PENDING";
  const [t, reviewsT, data] = await Promise.all([
    getTranslations("admin.reviews"),
    getTranslations("reviews"),
    getPolicyContext().then((ctx) => listReviews(ctx, status)),
  ]);
  const notice = NOTICES.find((value) => value === search.notice) ?? null;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      {notice ? (
        <Alert tone={notice === "published" || notice === "hidden" ? "success" : "danger"}>
          {t(`notices.${notice}`)}
        </Alert>
      ) : null}
      <nav
        aria-label={t("tabs.label")}
        className="flex gap-2 overflow-x-auto border-b border-border"
      >
        {reviewStatusSchema.options.map((key) => (
          <Link
            key={key}
            href={`/admin/reviews?status=${key}`}
            aria-current={key === status ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
              key === status
                ? "border-brand-700 text-brand-700"
                : "border-transparent text-muted hover:text-ink-900",
            )}
          >
            {t(`tabs.${key}`)} ({data.counts[key]})
          </Link>
        ))}
      </nav>

      {data.reviews.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <ul className="flex flex-col gap-4">
          {data.reviews.map((review) => (
            <li
              key={review.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Rating
                  value={review.rating}
                  label={reviewsT("rating", { rating: review.rating })}
                />
                <span className="text-sm text-muted">
                  {formatDateTime(review.createdAt, "da", ADMIN_TIME_ZONE)}
                </span>
              </div>
              <p className={review.comment ? "text-ink-900" : "text-muted"}>
                {review.comment ?? t("noComment")}
              </p>
              <p className="text-sm text-muted">
                {review.displayName} ·{" "}
                <Link
                  href={`/admin/bookings/${review.reference}`}
                  className="text-brand-700 underline"
                >
                  {t("booking", { reference: review.reference })}
                </Link>
              </p>
              <div className="flex flex-wrap gap-2">
                {review.status !== "PUBLISHED" ? (
                  <form action={setReviewStatusAction}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="status" value="PUBLISHED" />
                    <input type="hidden" name="from" value={status} />
                    <Button type="submit" size="sm">
                      <Eye aria-hidden />
                      {t("publish")}
                    </Button>
                  </form>
                ) : null}
                {review.status !== "HIDDEN" ? (
                  <form action={setReviewStatusAction}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="status" value="HIDDEN" />
                    <input type="hidden" name="from" value={status} />
                    <Button type="submit" size="sm" variant="secondary">
                      <EyeOff aria-hidden />
                      {t("hide")}
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
