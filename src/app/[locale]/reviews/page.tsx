import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { EmptyState } from "@/components/ui/feedback";
import { Container } from "@/components/ui/layout";
import { ReviewCard } from "@/components/features/reviews/review-card";
import { publishedReviews } from "@/server/catalog/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reviews">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "reviews" });
  return pageMetadata(locale as Locale, "/reviews", {
    title: t("title"),
    description: t("description"),
  });
}

export default async function ReviewsPage({ params }: PageProps<"/[locale]/reviews">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const [t, data] = await Promise.all([getTranslations(), publishedReviews(60)]);
  return (
    <Container className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {t("reviews.title")}
        </h1>
        <p className="text-lg text-muted">
          {data.count > 0 && data.average !== null
            ? t("home.reviews.average", { average: data.average.toFixed(1), count: data.count })
            : t("reviews.description")}
        </p>
      </header>
      {data.reviews.length === 0 ? (
        <EmptyState title={t("reviews.empty")} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </Container>
  );
}
