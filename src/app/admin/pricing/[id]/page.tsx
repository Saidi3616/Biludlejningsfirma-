import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PricingRuleForm } from "@/components/features/admin/pricing-rule-form";
import { AppError } from "@/lib/errors";
import { minorToInput } from "@/lib/format";
import { pricingRule } from "@/server/admin/pricing";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { deletePricingRuleAction, updatePricingRuleAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.pricing" });
  return { title: t("editTitle") };
}

/** Ret eller slet én prisregel. */
export default async function PricingRulePage({ params }: PageProps<"/admin/pricing/[id]">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const { id } = await params;
  const rule = await pricingRule(await getPolicyContext(), id).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const t = await getTranslations("admin.pricing");

  return (
    <>
      <Link
        href={`/admin/pricing?category=${rule.categoryId}`}
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back", { category: rule.category })}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("editTitle")}</h1>
      <p className="text-muted">{t("editIntro")}</p>
      <Card>
        <CardBody>
          <PricingRuleForm
            action={updatePricingRuleAction}
            categoryId={rule.categoryId}
            models={rule.models}
            ruleId={rule.id}
            defaults={{
              carModelId: rule.carModelId ?? "",
              minDays: String(rule.minDays),
              packagePrice: minorToInput(rule.packageMinor),
              perDayPrice: minorToInput(rule.perDayMinor),
              validFrom: rule.validFrom ?? "",
              validTo: rule.validTo ?? "",
              priority: String(rule.priority),
            }}
          />
        </CardBody>
      </Card>
      <form action={deletePricingRuleAction}>
        <input type="hidden" name="ruleId" value={rule.id} />
        <Button type="submit" variant="danger">
          <Trash2 aria-hidden />
          {t("delete")}
        </Button>
      </form>
    </>
  );
}
