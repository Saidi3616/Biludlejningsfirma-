import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { ModelForm } from "@/components/features/admin/model-form";
import { AppError } from "@/lib/errors";
import { minorToInput } from "@/lib/format";
import { adminModel, modelFormOptions } from "@/server/admin/models";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { updateModelAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.fleet.models" });
  return { title: t("edit") };
}

/** Ret en katalogmodel (MANAGER+). */
export default async function EditModelPage({ params }: PageProps<"/admin/fleet/models/[id]">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const { id } = await params;
  const ctx = await getPolicyContext();
  let model;
  try {
    model = await adminModel(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [t, { categories }] = await Promise.all([
    getTranslations("admin.fleet"),
    modelFormOptions(ctx),
  ]);
  const check = (value: boolean) => (value ? "on" : "");

  return (
    <>
      <Link
        href="/admin/fleet/models"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("models.back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {model.brand} {model.model}
      </h1>
      <Card>
        <CardBody>
          <ModelForm
            action={updateModelAction}
            categories={categories}
            modelId={model.id}
            defaults={{
              categoryId: model.categoryId,
              slug: model.slug,
              brand: model.brand,
              model: model.model,
              year: String(model.year),
              transmission: model.transmission,
              fuel: model.fuel,
              seats: String(model.seats),
              bags: String(model.bags),
              doors: String(model.doors),
              airConditioning: check(model.airConditioning),
              includedKmPerDay: String(model.includedKmPerDay),
              extraKmFee: minorToInput(model.extraKmFeeMinor),
              deposit: minorToInput(model.depositMinor),
              descriptionDa: model.descriptions.da,
              descriptionEn: model.descriptions.en,
              descriptionAr: model.descriptions.ar,
              descriptionFr: model.descriptions.fr,
              isActive: check(model.isActive),
              isFeatured: check(model.isFeatured),
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
