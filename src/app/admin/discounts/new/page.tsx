import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { DiscountForm } from "@/components/features/admin/discount-form";
import { discountOptions } from "@/server/admin/discounts";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { createDiscountAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.discounts" });
  return { title: t("new") };
}

/** Ny rabatkode (MANAGER+). */
export default async function NewDiscountPage() {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [t, options] = await Promise.all([
    getTranslations("admin.discounts"),
    getPolicyContext().then(discountOptions),
  ]);
  return (
    <>
      <Link
        href="/admin/discounts"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("new")}</h1>
      <Card>
        <CardBody>
          <DiscountForm
            action={createDiscountAction}
            options={options}
            defaults={{ type: "PERCENT", isActive: "on" }}
          />
        </CardBody>
      </Card>
    </>
  );
}
