import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { ReviewForm } from "@/components/features/reviews/review-form";
import { reviewContext } from "@/server/reviews/service";
import { submitReviewAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reviews/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "reviews.new" });
  // Linket indeholder et token: ingen indeksering og ingen referrer til andre sider.
  return { title: t("title"), robots: { index: false }, referrer: "no-referrer" };
}

/** Anmeldelse fra linket i e-mailen (E8). Kun afsluttede lejer, én gang pr. booking. */
export default async function NewReviewPage({
  params,
  searchParams,
}: PageProps<"/[locale]/reviews/new">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const search = await searchParams;
  const token = typeof search.token === "string" ? search.token : "";
  const [t, review] = await Promise.all([getTranslations("reviews.new"), reviewContext(token)]);

  return (
    <Container className="flex max-w-2xl flex-col gap-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      {review.state === "open" ? (
        <>
          <p className="text-lg text-muted">{t("intro", { car: review.carName })}</p>
          <Card>
            <CardBody>
              <ReviewForm
                action={submitReviewAction}
                token={token}
                displayName={review.displayName}
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <>
          <Alert tone={review.state === "invalid" ? "danger" : "info"}>{t(review.state)}</Alert>
          <Link href="/" className="font-medium text-brand-700 underline">
            {t("back")}
          </Link>
        </>
      )}
    </Container>
  );
}
