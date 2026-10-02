import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { ExtraForm } from "@/components/features/admin/extra-form";
import { requirePermission } from "@/server/auth/session";
import { createExtraAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.extras" });
  return { title: t("new") };
}

/** Nyt ekstraudstyr (MANAGER+). */
export default async function NewExtraPage() {
  setRequestLocale("da");
  await requirePermission("catalog:write");
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
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("new")}</h1>
      <Card>
        <CardBody>
          <ExtraForm
            action={createExtraAction}
            defaults={{ pricing: "PER_DAY", maxQuantity: "1", sortOrder: "0", isActive: "on" }}
          />
        </CardBody>
      </Card>
    </>
  );
}
