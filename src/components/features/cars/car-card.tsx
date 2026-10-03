import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ImagePlaceholder } from "@/components/ui/image-placeholder";
import { formatMoney } from "@/lib/format";
import type { CatalogCar } from "@/server/catalog/service";
import type { Quote } from "@/server/pricing/types";
import { CarSpecs } from "./car-specs";

/**
 * Et bilkort i kataloget og på forsiden. Med en søgt periode vises totalprisen,
 * ellers "fra"-prisen pr. dag. Hele kortet er ét link, så det er nemt at ramme på mobil.
 */
export function CarCard({
  car,
  quote,
  query,
  headingLevel = "h3",
}: {
  car: CatalogCar;
  quote?: Quote;
  /** Søgningens sted og periode, som bil-siden skal huske. */
  query?: Record<string, string>;
  headingLevel?: "h2" | "h3";
}) {
  const t = useTranslations("cars");
  const locale = useLocale();
  const Heading = headingLevel;
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-lg border border-border bg-white shadow-(--shadow-card) transition-shadow hover:shadow-(--shadow-raised)">
      {car.image ? (
        <div className="relative aspect-[16/10] border-b border-border bg-ink-50">
          <Image
            src={car.image.url}
            alt={car.image.alt}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : (
        <ImagePlaceholder
          subject={t("imagePlaceholder", { name: car.name })}
          format="professional automotive photography"
          ratio="16/10"
          className="rounded-none border-0 border-b"
        />
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <Heading className="text-lg font-semibold text-ink-900">
            <Link
              href={{ pathname: `/cars/${car.slug}`, query }}
              className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-lg after:focus-visible:ring-2 after:focus-visible:ring-brand-600"
            >
              {car.name}
            </Link>
          </Heading>
          <Badge tone="brand">{car.categoryName}</Badge>
        </div>
        <CarSpecs car={car} compact />
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          {quote ? (
            <p className="flex flex-col">
              <span className="text-xl font-semibold text-ink-900">
                {t("total", {
                  price: formatMoney(quote.totalMinor, quote.currency, locale),
                })}
              </span>
            </p>
          ) : (
            <p className="flex items-baseline gap-1">
              <span className="text-xl font-semibold text-ink-900">
                {t("fromPerDay", {
                  price: formatMoney(car.fromPerDayMinor, car.currency, locale),
                })}
              </span>
              <span className="text-sm text-muted">{t("perDay")}</span>
            </p>
          )}
          <span aria-hidden className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t("details")}
          </span>
        </div>
      </div>
    </article>
  );
}
