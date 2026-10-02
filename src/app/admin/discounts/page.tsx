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
import { formatDate } from "@/lib/format";
import { listDiscounts } from "@/server/admin/discounts";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.discounts" });
  return { title: t("title") };
}

const NOTICES = ["created", "saved", "deleted", "inUse", "forbidden", "failed"] as const;
const SUCCESS = new Set(["created", "saved", "deleted"]);

/** "YYYY-MM-DD" som dansk dato. */
function day(key: string) {
  return formatDate(new Date(`${key}T12:00:00Z`), "da", "UTC");
}

/** Rabatkoder (F8): værdi, periode, hvor mange gange de er brugt, og om de er aktive. */
export default async function DiscountsPage({ searchParams }: PageProps<"/admin/discounts">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [t, ctx, search] = await Promise.all([
    getTranslations("admin.discounts"),
    getPolicyContext(),
    searchParams,
  ]);
  const discounts = await listDiscounts(ctx);
  const notice = NOTICES.find((value) => value === search.notice) ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        <Button asChild>
          <Link href="/admin/discounts/new">
            <Plus aria-hidden />
            {t("new")}
          </Link>
        </Button>
      </div>
      <CatalogTabs current="discounts" />
      <p className="text-muted">{t("intro")}</p>
      {notice ? (
        <Alert tone={SUCCESS.has(notice) ? "success" : "danger"}>{t(`notices.${notice}`)}</Alert>
      ) : null}

      {discounts.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table label={t("title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("columns.code")}</TH>
              <TH className="text-end">{t("columns.value")}</TH>
              <TH>{t("columns.period")}</TH>
              <TH className="text-end">{t("columns.used")}</TH>
              <TH>{t("columns.status")}</TH>
            </TR>
          </THead>
          <tbody>
            {discounts.map((discount) => (
              <TR key={discount.id}>
                <TD>
                  <span className="flex flex-col">
                    <Link
                      href={`/admin/discounts/${discount.id}`}
                      className="font-mono font-medium text-brand-700 underline"
                    >
                      {discount.code}
                    </Link>
                    {discount.restricted ? (
                      <span className="text-sm text-muted">{t("restricted")}</span>
                    ) : null}
                  </span>
                </TD>
                <TD className="text-end">
                  {discount.type === "PERCENT" ? (
                    t("percent", { value: discount.value })
                  ) : (
                    <Price amountMinor={discount.value} currency={discount.currency ?? "DKK"} />
                  )}
                </TD>
                <TD>
                  {!discount.validFrom && !discount.validTo ? (
                    t("always")
                  ) : (
                    <span className="flex flex-col text-sm">
                      {discount.validFrom ? (
                        <span>{t("from", { date: day(discount.validFrom) })}</span>
                      ) : null}
                      {discount.validTo ? (
                        <span>{t("until", { date: day(discount.validTo) })}</span>
                      ) : null}
                    </span>
                  )}
                </TD>
                <TD className="text-end">
                  {discount.maxUses === null
                    ? discount.used
                    : t("usedOf", { used: discount.used, max: discount.maxUses })}
                </TD>
                <TD>
                  <Badge tone={discount.isActive ? "success" : "neutral"}>
                    {discount.isActive ? t("active") : t("inactive")}
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
