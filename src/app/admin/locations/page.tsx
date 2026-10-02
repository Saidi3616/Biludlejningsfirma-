import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { CatalogTabs } from "@/components/features/admin/catalog-tabs";
import { listLocations } from "@/server/admin/locations";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.locations" });
  return { title: t("title") };
}

/** Lokationer (F8): type, biler, kommende afhentninger og om de kan bookes. */
export default async function LocationsPage() {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [t, ctx] = await Promise.all([getTranslations("admin.locations"), getPolicyContext()]);
  const locations = await listLocations(ctx);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        <Button asChild>
          <Link href="/admin/locations/new">
            <Plus aria-hidden />
            {t("new")}
          </Link>
        </Button>
      </div>
      <CatalogTabs current="locations" />
      <p className="text-muted">{t("intro")}</p>

      {locations.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table label={t("title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("columns.name")}</TH>
              <TH>{t("columns.type")}</TH>
              <TH className="text-end">{t("columns.cars")}</TH>
              <TH className="text-end">{t("columns.upcoming")}</TH>
              <TH>{t("columns.status")}</TH>
            </TR>
          </THead>
          <tbody>
            {locations.map((location) => (
              <TR key={location.id}>
                <TD>
                  <span className="flex flex-col">
                    <Link
                      href={`/admin/locations/${location.id}`}
                      className="font-medium text-brand-700 underline"
                    >
                      {location.name}
                    </Link>
                    <span className="text-sm text-muted">{location.city}</span>
                  </span>
                </TD>
                <TD>
                  <span className="flex flex-col">
                    <span>{t(`types.${location.type}`)}</span>
                    {location.deliveryEnabled ? (
                      <span className="text-sm text-muted">{t("delivery")}</span>
                    ) : null}
                  </span>
                </TD>
                <TD className="text-end">{location.cars}</TD>
                <TD className="text-end">{location.upcoming}</TD>
                <TD>
                  <Badge tone={location.isActive ? "success" : "neutral"}>
                    {location.isActive ? t("active") : t("inactive")}
                  </Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
