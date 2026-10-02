import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Price } from "@/components/ui/price";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { CatalogTabs } from "@/components/features/admin/catalog-tabs";
import { listExtras } from "@/server/admin/extras";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.extras" });
  return { title: t("title") };
}

const NOTICES = ["created", "saved", "deleted", "inUse", "forbidden", "failed"] as const;
const SUCCESS = new Set(["created", "saved", "deleted"]);

/** Ekstraudstyr (F8): pris, loft, antal og om det kan vælges i bookingflowet. */
export default async function ExtrasPage({ searchParams }: PageProps<"/admin/extras">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [t, ctx, search] = await Promise.all([
    getTranslations("admin.extras"),
    getPolicyContext(),
    searchParams,
  ]);
  const extras = await listExtras(ctx);
  const notice = NOTICES.find((value) => value === search.notice) ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        <Button asChild>
          <Link href="/admin/extras/new">
            <Plus aria-hidden />
            {t("new")}
          </Link>
        </Button>
      </div>
      <CatalogTabs current="extras" />
      <p className="text-muted">{t("intro")}</p>
      {notice ? (
        <Alert tone={SUCCESS.has(notice) ? "success" : "danger"}>{t(`notices.${notice}`)}</Alert>
      ) : null}

      {extras.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table label={t("title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("columns.name")}</TH>
              <TH className="text-end">{t("columns.price")}</TH>
              <TH className="text-end">{t("columns.maxQuantity")}</TH>
              <TH className="text-end">{t("columns.used")}</TH>
              <TH>{t("columns.status")}</TH>
            </TR>
          </THead>
          <tbody>
            {extras.map((extra) => (
              <TR key={extra.id}>
                <TD>
                  <span className="flex flex-col">
                    <Link
                      href={`/admin/extras/${extra.id}`}
                      className="font-medium text-brand-700 underline"
                    >
                      {extra.name}
                    </Link>
                    <span className="text-sm text-muted">{extra.code}</span>
                  </span>
                </TD>
                <TD className="text-end">
                  <span className="flex flex-col items-end">
                    <span>
                      <Price amountMinor={extra.priceMinor} currency={extra.currency} />{" "}
                      {t(`per.${extra.pricing}`)}
                    </span>
                    {extra.maxPriceMinor !== null ? (
                      <span className="text-sm text-muted">
                        {t("max")}{" "}
                        <Price amountMinor={extra.maxPriceMinor} currency={extra.currency} />
                      </span>
                    ) : null}
                  </span>
                </TD>
                <TD className="text-end">{extra.maxQuantity}</TD>
                <TD className="text-end">{extra.used}</TD>
                <TD>
                  <Badge tone={extra.isActive ? "success" : "neutral"}>
                    {extra.isActive ? t("active") : t("inactive")}
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
