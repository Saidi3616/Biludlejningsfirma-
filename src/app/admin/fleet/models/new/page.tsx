import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { ModelForm } from "@/components/features/admin/model-form";
import { modelFormOptions } from "@/server/admin/models";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { createModelAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.fleet.models" });
  return { title: t("new") };
}

/** Ny katalogmodel (MANAGER+). Billeder kommer i næste del af M11. */
export default async function NewModelPage() {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [t, { categories }] = await Promise.all([
    getTranslations("admin.fleet"),
    getPolicyContext().then(modelFormOptions),
  ]);

  return (
    <>
      <Link
        href="/admin/fleet/models"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("models.back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("models.new")}</h1>
      <Card>
        <CardBody>
          <ModelForm
            action={createModelAction}
            categories={categories}
            defaults={{
              year: String(new Date().getFullYear()),
              transmission: "AUTOMATIC",
              fuel: "PETROL",
              seats: "5",
              doors: "5",
              bags: "2",
              airConditioning: "on",
              includedKmPerDay: "200",
              isActive: "on",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
