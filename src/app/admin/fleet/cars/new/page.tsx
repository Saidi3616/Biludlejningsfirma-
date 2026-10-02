import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { CarForm } from "@/components/features/admin/car-form";
import { carFormOptions } from "@/server/admin/fleet";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { createCarAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.fleet.cars" });
  return { title: t("new") };
}

/** Ny bil i flåden (MANAGER+). */
export default async function NewCarPage() {
  setRequestLocale("da");
  await requirePermission("fleet:write");
  const [t, options] = await Promise.all([
    getTranslations("admin.fleet"),
    getPolicyContext().then(carFormOptions),
  ]);

  return (
    <>
      <Link
        href="/admin/fleet/cars"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("cars.new")}</h1>
      <Card>
        <CardBody>
          <CarForm
            action={createCarAction}
            options={options}
            defaults={{ odometerKm: "0" }}
            showPurchasePrice
          />
        </CardBody>
      </Card>
    </>
  );
}
