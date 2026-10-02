import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/layout";
import { OpeningHours } from "@/components/features/locations/opening-hours";
import { listLocations } from "@/server/catalog/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/locations">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "locations" });
  return { title: t("title"), description: t("description") };
}

export default async function LocationsPage({ params }: PageProps<"/[locale]/locations">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const [t, locations] = await Promise.all([getTranslations("locations"), listLocations()]);

  return (
    <Container className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {t("title")}
        </h1>
        <p className="text-lg text-muted">{t("description")}</p>
      </header>
      <ul className="grid gap-6 md:grid-cols-2">
        {locations.map((location) => (
          <li key={location.id} className="flex">
            <Card className="w-full">
              <CardBody className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-ink-900">
                    <Link href={`/locations/${location.slug}`} className="hover:underline">
                      {location.name}
                    </Link>
                  </h2>
                  <Badge tone="brand">{t(`types.${location.type}`)}</Badge>
                </div>
                <p className="flex gap-2 text-base text-ink-700">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />
                  {location.address}, {location.postalCode} {location.city}
                </p>
                <OpeningHours rows={location.openingHours} />
                <Link
                  href={{ pathname: "/cars", query: { location: location.slug } }}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {t("findCars", { name: location.name })}
                </Link>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
    </Container>
  );
}
