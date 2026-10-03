import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { ModelForm } from "@/components/features/admin/model-form";
import { AppError } from "@/lib/errors";
import { minorToInput } from "@/lib/format";
import { adminModel, MAX_MODEL_IMAGES, modelFormOptions } from "@/server/admin/models";
import { mediaUrl } from "@/lib/media";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhotoUpload } from "@/components/features/admin/photo-upload";
import Image from "next/image";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import {
  addModelImageAction,
  deleteModelImageAction,
  firstModelImageAction,
  updateModelAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.fleet.models" });
  return { title: t("edit") };
}

/** Ret en katalogmodel (MANAGER+). */
const NOTICES = ["imageDeleted", "imageFirst", "forbidden", "failed"] as const;

export default async function EditModelPage({
  params,
  searchParams,
}: PageProps<"/admin/fleet/models/[id]">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const notice = NOTICES.find((value) => value === search.notice);
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
      {notice ? (
        <Alert tone={notice.startsWith("image") ? "success" : "danger"}>
          {t(`models.notices.${notice}`)}
        </Alert>
      ) : null}

      <section id="images" aria-labelledby="images-title" className="flex flex-col gap-3">
        <h2 id="images-title" className="text-lg font-semibold text-ink-900">
          {t("models.images")}
        </h2>
        <p className="text-sm text-muted">{t("models.imagesHint", { max: MAX_MODEL_IMAGES })}</p>
        {model.images.length === 0 ? (
          <p className="text-muted">{t("models.noImages")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {model.images.map((image, index) => (
              <li key={image.id} className="flex flex-col gap-2">
                <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-border bg-ink-50">
                  <Image
                    src={mediaUrl(image.storageKey)}
                    alt={t("models.imageAlt", {
                      name: `${model.brand} ${model.model}`,
                      n: index + 1,
                    })}
                    fill
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {index === 0 ? (
                    <Badge tone="brand">{t("models.firstImage")}</Badge>
                  ) : (
                    <form action={firstModelImageAction}>
                      <input type="hidden" name="modelId" value={model.id} />
                      <input type="hidden" name="imageId" value={image.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        {t("models.makeFirst")}
                      </Button>
                    </form>
                  )}
                  <form action={deleteModelImageAction}>
                    <input type="hidden" name="modelId" value={model.id} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {t("models.deleteImage")}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {model.images.length < MAX_MODEL_IMAGES ? (
          <PhotoUpload
            action={addModelImageAction}
            fields={{ modelId: model.id }}
            label={t("models.addImages")}
          />
        ) : null}
      </section>

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
