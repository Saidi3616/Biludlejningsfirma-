import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import { CarCard } from "@/components/features/cars/car-card";
import { HowItWorks, WhatsAppCta, WhyUs } from "@/components/features/home/sections";
import { ReviewCard } from "@/components/features/reviews/review-card";
import { JsonLd } from "@/components/features/seo/json-ld";
import { pageMetadata } from "@/lib/seo";
import { organizationJsonLd } from "@/lib/structured-data";
import { SearchForm } from "@/components/features/search/search-form";
import {
  businessToday,
  featuredCars,
  publishedReviews,
  searchLocations,
} from "@/server/catalog/service";

// Priser og ledighed ændrer sig; siden bygges ved hver forespørgsel.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = (await params) as { locale: Locale };
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata(locale, "/", {
    title: { absolute: t("title") },
    description: t("description"),
  });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations();
  const [locations, cars, reviews] = await Promise.all([
    searchLocations(),
    featuredCars({ locale, limit: 3 }),
    publishedReviews(3),
  ]);

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <section className="bg-brand-900 text-white">
        <Container className="grid grid-cols-1 gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:py-20">
          <div className="flex flex-col gap-4">
            <h1 className="text-(length:--text-display) leading-(--text-display--line-height) font-semibold tracking-(--text-display--letter-spacing)">
              {t("home.title")}
            </h1>
            <p className="max-w-xl text-lg text-brand-100">{t("home.subtitle")}</p>
          </div>
          <div className="rounded-lg bg-white p-5 text-ink-900 shadow-(--shadow-raised) sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">{t("home.searchTitle")}</h2>
            <SearchForm
              action={localizedPath(locale, "/cars")}
              locations={locations}
              values={{}}
              minDate={businessToday()}
              submitLabel={t("search.submit")}
            />
          </div>
        </Container>
      </section>

      {cars.length > 0 ? (
        <Section title={t("home.popular.title")} description={t("home.popular.description")}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>
          <Button asChild variant="secondary" className="mt-8">
            <Link href="/cars">
              {t("home.popular.all")}
              <ArrowRight className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </Section>
      ) : null}

      <WhyUs />
      <HowItWorks />

      {reviews.count > 0 && reviews.average !== null ? (
        <Section
          title={t("home.reviews.title")}
          description={t("home.reviews.average", {
            average: reviews.average.toFixed(1),
            count: reviews.count,
          })}
          className="bg-ink-50"
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {reviews.reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </Section>
      ) : null}

      <WhatsAppCta />
    </>
  );
}
