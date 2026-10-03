import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ExtraForm } from "@/components/features/admin/extra-form";
import { AppError } from "@/lib/errors";
import { localized } from "@/lib/localized";
import { minorToInput } from "@/lib/format";
import { adminExtra } from "@/server/admin/extras";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { deleteExtraAction, updateExtraAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.extras" });
  return { title: t("editTitle") };
}

/** Ret ekstraudstyr. Udstyr, der har været booket, kan kun deaktiveres, ikke slettes. */
export default async function ExtraPage({ params }: PageProps<"/admin/extras/[id]">) {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const { id } = await params;
  const extra = await adminExtra(await getPolicyContext(), id).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const t = await getTranslations("admin.extras");

  return (
    <>
      <Link
        href="/admin/extras"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {localized(extra.nameI18n, "da")}
      </h1>
      <Card>
        <CardBody>
          <ExtraForm
            action={updateExtraAction}
            extraId={extra.id}
            defaults={{
              code: extra.code,
              nameDa: extra.names.da,
              nameEn: extra.names.en,
              nameAr: extra.names.ar,
              nameFr: extra.names.fr,
              descriptionDa: extra.descriptions.da,
              descriptionEn: extra.descriptions.en,
              descriptionAr: extra.descriptions.ar,
              descriptionFr: extra.descriptions.fr,
              pricing: extra.pricing,
              price: minorToInput(extra.priceMinor),
              maxPrice: extra.maxPriceMinor === null ? "" : minorToInput(extra.maxPriceMinor),
              maxQuantity: String(extra.maxQuantity),
              stock: extra.stock === null ? "" : String(extra.stock),
              sortOrder: String(extra.sortOrder),
              isActive: extra.isActive ? "on" : "",
            }}
          />
        </CardBody>
      </Card>
      {extra.used === 0 ? (
        <form action={deleteExtraAction}>
          <input type="hidden" name="extraId" value={extra.id} />
          <Button type="submit" variant="danger">
            <Trash2 aria-hidden />
            {t("delete")}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">{t("usedNote", { count: extra.used })}</p>
      )}
    </>
  );
}
