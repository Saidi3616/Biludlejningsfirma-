import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { FleetTabs } from "@/components/features/admin/fleet-tabs";
import { listModels } from "@/server/admin/models";
import { can } from "@/server/auth/policies";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.fleet.models" });
  return { title: t("title") };
}

const NOTICES = ["created", "saved"] as const;

/** Katalogmodeller: det kunden ser og booker (04-sitemap /admin/fleet/models). */
export default async function AdminModelsPage({ searchParams }: PageProps<"/admin/fleet/models">) {
  setRequestLocale("da");
  await requirePermission("fleet:read");
  const [t, ctx, search] = await Promise.all([
    getTranslations("admin.fleet"),
    getPolicyContext(),
    searchParams,
  ]);
  const models = await listModels(ctx);
  const canWrite = can(ctx, "catalog:write");
  const notice = NOTICES.find((value) => value === search.notice);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        {canWrite ? (
          <Button asChild>
            <Link href="/admin/fleet/models/new">
              <Plus aria-hidden />
              {t("models.new")}
            </Link>
          </Button>
        ) : null}
      </div>
      <FleetTabs current="models" />
      {notice ? <Alert tone="success" title={t(`models.notices.${notice}`)} /> : null}

      {models.length === 0 ? (
        <EmptyState title={t("models.empty")} />
      ) : (
        <Table label={t("models.title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("models.columns.model")}</TH>
              <TH>{t("models.columns.category")}</TH>
              <TH className="text-end">{t("models.columns.cars")}</TH>
              <TH>{t("models.columns.visibility")}</TH>
            </TR>
          </THead>
          <tbody>
            {models.map((model) => (
              <TR key={model.id}>
                <TD>
                  <span className="flex flex-col">
                    {canWrite ? (
                      <Link
                        href={`/admin/fleet/models/${model.id}`}
                        className="font-medium text-brand-700 underline"
                      >
                        {model.brand} {model.model}
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {model.brand} {model.model}
                      </span>
                    )}
                    <span className="text-sm text-muted">
                      {model.year} · /{model.slug}
                    </span>
                  </span>
                </TD>
                <TD>{model.category}</TD>
                <TD className="text-end">{model.cars}</TD>
                <TD>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={model.isActive ? "success" : "neutral"}>
                      {model.isActive ? t("models.active") : t("models.inactive")}
                    </Badge>
                    {model.isFeatured ? <Badge tone="brand">{t("models.featured")}</Badge> : null}
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
