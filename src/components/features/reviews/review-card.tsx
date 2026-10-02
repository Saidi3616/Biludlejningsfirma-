import { useTranslations } from "next-intl";
import { Rating } from "@/components/ui/rating";

export type ReviewData = {
  id: string;
  rating: number;
  comment: string | null;
  displayName: string;
};

export function ReviewCard({ review }: { review: ReviewData }) {
  const t = useTranslations("reviews");
  return (
    <figure className="flex flex-col gap-3 rounded-lg border border-border bg-white p-5">
      <Rating value={review.rating} label={t("rating", { rating: review.rating })} />
      {review.comment ? (
        <blockquote className="text-base text-ink-800">“{review.comment}”</blockquote>
      ) : null}
      <figcaption className="text-sm font-medium text-muted">{review.displayName}</figcaption>
    </figure>
  );
}
