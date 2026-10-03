import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin, Phone, Truck } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { localizedPath } from "@/i18n/paths";
import { site } from "@/config/site";
import { absoluteUrl, pageMetadata } from "@/lib/seo";
import { locationJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/features/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { OpeningHours } from "@/components/features/locations/opening-hours";
import { SearchForm } from "@/components/features/search/search-form";
import { businessToday, getLocation, searchLocations } from "@/server/catalog/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/locations/[slug]">): Promise<Metadata> {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  const [location, t] = await Promise.all([
    getLocation(slug),
    getTranslations({ locale, namespace: "locations" }),
  ]);
  if (!location) return {};
  return pageMetadata(locale, `/locations/${slug}`, {
    title: location.name,
    description: t("pageDescription", {
      name: location.name,
      address: `${location.address}, ${location.postalCode} ${location.city}`,
    }),
  });
}

export default async function LocationPage({ params }: PageProps<"/[locale]/locations/[slug]">) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string };
  setRequestLocale(locale);
  const location = await getLocation(slug);
  if (!location) notFound();
  const [t, locations] = await Promise.all([getTranslations(), searchLocations()]);
  const phone = location.phone ?? site.phone;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=16/${location.lat}/${location.lng}`;

  return (
    <Container className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      <JsonLd
        data={locationJsonLd(location, absoluteUrl(localizedPath(locale, `/locations/${slug}`)))}
      />
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <Badge tone="brand" className="self-start">
            {t(`locations.types.${location.type}`)}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            {location.name}
          </h1>
        </header>
        <section aria-labelledby="address" className="flex flex-col gap-2">
          <h2 id="address" className="text-xl font-semibold text-ink-900">
            {t("locations.address")}
          </h2>
          <p className="flex gap-2 text-base text-ink-700">
            <MapPin className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
            {location.address}, {location.postalCode} {location.city}
          </p>
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start font-medium text-brand-700 hover:underline"
          >
            {t("locations.showMap")}
          </a>
        </section>
        <section aria-labelledby="hours" className="flex flex-col gap-2">
          <h2 id="hours" className="text-xl font-semibold text-ink-900">
            {t("locations.openingHours")}
          </h2>
          <OpeningHours rows={location.openingHours} />
        </section>
        <section aria-labelledby="contact" className="flex flex-col gap-2">
          <h2 id="contact" className="text-xl font-semibold text-ink-900">
            {t("locations.contact")}
          </h2>
          <a
            href={`tel:${phone.replace(/\s/g, "")}`}
            className="flex items-center gap-2 self-start text-base text-ink-800 hover:underline"
            dir="ltr"
          >
            <Phone className="size-5 text-ink-500" aria-hidden />
            {phone}
          </a>
          {location.deliveryEnabled ? (
            <p className="flex items-center gap-2 text-base text-ink-700">
              <Truck className="size-5 text-ink-500" aria-hidden />
              {t("locations.delivery")}
            </p>
          ) : null}
        </section>
      </div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-ink-900">
            {t("locations.findCars", { name: location.name })}
          </h2>
          <SearchForm
            action={localizedPath(locale, "/cars")}
            locations={locations}
            values={{ location: location.slug }}
            minDate={businessToday()}
            submitLabel={t("search.submit")}
          />
        </CardBody>
      </Card>
    </Container>
  );
}
