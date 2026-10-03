import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { CatalogTabs } from "@/components/features/admin/catalog-tabs";
import { PricingRuleForm } from "@/components/features/admin/pricing-rule-form";
import { localDateKey } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { pricePreview, pricingOverview } from "@/server/admin/pricing";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { createPricingRuleAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.pricing" });
  return { title: t("title") };
}

const NOTICES = ["created", "saved", "deleted", "forbidden", "failed"] as const;
const SUCCESS = new Set(["created", "saved", "deleted"]);

function text(search: Record<string, string | string[] | undefined>, key: string) {
  const value = search[key];
  return typeof value === "string" ? value : "";
}

/**
 * Prisregler pr. kategori (F8, K3): pristrappen med pakker og dagspriser, modelpriser og sæsoner,
 * og en forhåndsvisning af, hvad en leje koster.
 */
export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [t, ctx, search] = await Promise.all([
    getTranslations("admin.pricing"),
    getPolicyContext(),
    searchParams,
  ]);
  const overview = await pricingOverview(ctx, text(search, "category") || null);
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const today = localDateKey(new Date(), ADMIN_TIME_ZONE);
  const date = (key: string) => formatDate(new Date(`${key}T12:00:00Z`), "da", "UTC");

  const preview = {
    carModelId: text(search, "model") || overview.models[0]?.id || "",
    days: text(search, "days") || "5",
    date: text(search, "date") || today,
  };
  let previewResult: Awaited<ReturnType<typeof pricePreview>> | null = null;
  let previewInvalid = false;
  if (search.days && overview.category) {
    try {
      previewResult = await pricePreview(ctx, preview);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "VALIDATION_FAILED") throw error;
      previewInvalid = true;
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <CatalogTabs current="pricing" />
      <p className="text-muted">{t("intro")}</p>
      {notice ? (
        <Alert tone={SUCCESS.has(notice) ? "success" : "danger"}>{t(`notices.${notice}`)}</Alert>
      ) : null}

      {!overview.category ? (
        <EmptyState title={t("noCategories")} />
      ) : (
        <>
          <nav aria-label={t("categories")} className="flex flex-wrap gap-2">
            {overview.categories.map((category) => (
              <Link
                key={category.id}
                href={`/admin/pricing?category=${category.id}`}
                aria-current={category.id === overview.category!.id ? "page" : undefined}
                className={
                  category.id === overview.category!.id
                    ? "rounded-full bg-brand-700 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
                }
              >
                {category.name}
              </Link>
            ))}
          </nav>

          <section aria-labelledby="rules" className="flex flex-col gap-3">
            <h2 id="rules" className="text-lg font-semibold text-ink-900">
              {t("rulesTitle", { category: overview.category.name })}
            </h2>
            {overview.warnings.map((warning) => (
              <Alert key={warning} tone="warning">
                {t(`warnings.${warning}`)}
              </Alert>
            ))}
            {overview.rules.length === 0 ? (
              <EmptyState title={t("empty")} />
            ) : (
              <Table
                label={t("rulesTitle", { category: overview.category.name })}
                className="bg-white"
              >
                <THead>
                  <TR>
                    <TH>{t("columns.scope")}</TH>
                    <TH>{t("columns.season")}</TH>
                    <TH className="text-end">{t("columns.minDays")}</TH>
                    <TH className="text-end">{t("columns.package")}</TH>
                    <TH className="text-end">{t("columns.perDay")}</TH>
                    <TH className="text-end">{t("columns.priority")}</TH>
                    <TH>
                      <span className="sr-only">{t("columns.actions")}</span>
                    </TH>
                  </TR>
                </THead>
                <tbody>
                  {overview.rules.map((rule) => (
                    <TR key={rule.id}>
                      <TD>{rule.model ?? <Badge>{t("wholeCategory")}</Badge>}</TD>
                      <TD>
                        {rule.validFrom || rule.validTo
                          ? t("season", {
                              from: rule.validFrom ? date(rule.validFrom) : "…",
                              to: rule.validTo ? date(rule.validTo) : "…",
                            })
                          : t("always")}
                      </TD>
                      <TD className="text-end">{t("days", { days: rule.minDays })}</TD>
                      <TD className="text-end">
                        <Price amountMinor={rule.packageMinor} currency={rule.currency} />
                      </TD>
                      <TD className="text-end">
                        <Price amountMinor={rule.perDayMinor} currency={rule.currency} />
                      </TD>
                      <TD className="text-end">{rule.priority}</TD>
                      <TD>
                        <Link
                          href={`/admin/pricing/${rule.id}`}
                          className="font-medium text-brand-700 underline"
                          aria-label={t("editLabel", {
                            days: rule.minDays,
                            scope: rule.model ?? t("wholeCategory"),
                          })}
                        >
                          {t("edit")}
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section aria-labelledby="preview" className="flex flex-col gap-3">
            <h2 id="preview" className="text-lg font-semibold text-ink-900">
              {t("preview.title")}
            </h2>
            <Card>
              <CardBody className="flex flex-col gap-4">
                <form method="get" className="flex flex-wrap items-end gap-4">
                  <input type="hidden" name="category" value={overview.category.id} />
                  <Field label={t("preview.model")} className="min-w-48">
                    {(field) => (
                      <Select name="model" defaultValue={preview.carModelId} {...field}>
                        {overview.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t("preview.days")} className="w-28">
                    {(field) => (
                      <Input
                        name="days"
                        inputMode="numeric"
                        defaultValue={preview.days}
                        {...field}
                      />
                    )}
                  </Field>
                  <Field label={t("preview.date")} className="w-44">
                    {(field) => (
                      <Input name="date" type="date" defaultValue={preview.date} {...field} />
                    )}
                  </Field>
                  <Button type="submit" variant="secondary">
                    {t("preview.submit")}
                  </Button>
                </form>
                {previewInvalid ? <Alert tone="danger">{t("preview.invalid")}</Alert> : null}
                {previewResult ? (
                  <p role="status" className="text-ink-900">
                    {previewResult.price ? (
                      <>
                        {t("preview.result", { days: previewResult.days })}{" "}
                        <strong>
                          <Price
                            amountMinor={previewResult.price.totalMinor}
                            currency={previewResult.currency}
                          />
                        </strong>
                        <br />
                        <span className="text-sm text-muted">
                          {previewResult.price.isPackage
                            ? t("preview.package", { days: previewResult.price.minDays })
                            : previewResult.price.cappedByNextPackage
                              ? t("preview.capped")
                              : t("preview.perDay", { days: previewResult.price.minDays })}
                        </span>
                      </>
                    ) : (
                      t("preview.none", { days: previewResult.days })
                    )}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          </section>

          <section aria-labelledby="new-rule" className="flex flex-col gap-3">
            <h2 id="new-rule" className="text-lg font-semibold text-ink-900">
              {t("newTitle")}
            </h2>
            <Card>
              <CardBody>
                <PricingRuleForm
                  key={overview.category.id}
                  action={createPricingRuleAction}
                  categoryId={overview.category.id}
                  models={overview.models}
                  defaults={{ priority: "0" }}
                />
              </CardBody>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
