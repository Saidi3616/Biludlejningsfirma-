import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { formatMoney } from "@/lib/format";
import { PriceLadder } from "@/components/features/cars/price-ladder";
import { pricingOverview } from "@/server/catalog/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "pricing" });
  return pageMetadata(locale as Locale, "/pricing", {
    title: t("title"),
    description: t("description"),
  });
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const [t, overview] = await Promise.all([getTranslations("pricing"), pricingOverview(locale)]);
  const oneWay = overview.locations.filter((location) => location.oneWayFeeMinor !== null);
  const delivery = overview.locations.filter(
    (location) => location.deliveryEnabled && location.deliveryZones.length > 0,
  );

  return (
    <Container className="flex flex-col gap-10 py-12">
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {t("title")}
        </h1>
        <p className="text-lg text-muted">{t("description")}</p>
      </header>

      <section aria-labelledby="ladder" className="flex flex-col gap-4">
        <h2 id="ladder" className="text-2xl font-semibold text-ink-900">
          {t("ladderTitle")}
        </h2>
        <p className="max-w-3xl text-base text-ink-700">{t("ladderNote")}</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {overview.categories.map((category) => (
            <Card key={category.slug}>
              <CardHeader>
                <CardTitle>{category.name}</CardTitle>
              </CardHeader>
              <CardBody>
                <PriceLadder
                  tiers={category.tiers}
                  currency={category.currency}
                  label={category.name}
                />
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {overview.extras.length > 0 ? (
        <section aria-labelledby="extras" className="flex flex-col gap-4">
          <h2 id="extras" className="text-2xl font-semibold text-ink-900">
            {t("extrasTitle")}
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.extras.map((extra) => (
              <li
                key={extra.code}
                className="flex flex-col gap-1 rounded-lg border border-border p-4"
              >
                <span className="font-semibold text-ink-900">{extra.name}</span>
                {extra.description ? (
                  <span className="text-sm text-muted">{extra.description}</span>
                ) : null}
                <span className="text-base text-ink-800">
                  {t(extra.pricing === "PER_DAY" ? "extraPerDay" : "extraPerBooking", {
                    price: formatMoney(extra.priceMinor, extra.currency, locale),
                  })}
                  {extra.maxPriceMinor !== null ? (
                    <span className="text-sm text-muted">
                      {" · "}
                      {t("extraMax", {
                        price: formatMoney(extra.maxPriceMinor!, extra.currency, locale),
                      })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="fees" className="flex flex-col gap-4">
        <h2 id="fees" className="text-2xl font-semibold text-ink-900">
          {t("feesTitle")}
        </h2>
        {oneWay.length === 0 && delivery.length === 0 ? (
          <p className="text-base text-ink-700">{t("noFees")}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-base text-ink-700">
            {oneWay.map((location) => (
              <li key={`one-way-${location.slug}`}>
                {t("oneWay", {
                  location: location.name,
                  price: formatMoney(location.oneWayFeeMinor!, "DKK", locale),
                })}
              </li>
            ))}
            {delivery.flatMap((location) =>
              location.deliveryZones.map((zone) => (
                <li key={`delivery-${location.slug}-${zone.maxDistanceKm}`}>
                  {t("delivery", {
                    location: location.name,
                    km: zone.maxDistanceKm,
                    price: formatMoney(zone.feeMinor, zone.currency, locale),
                  })}
                </li>
              )),
            )}
          </ul>
        )}
      </section>

      <Button asChild variant="cta" size="lg" className="self-start">
        <Link href="/cars">{t("cta")}</Link>
      </Button>
    </Container>
  );
}
