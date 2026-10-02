import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { LocationForm } from "@/components/features/admin/location-form";
import { requirePermission } from "@/server/auth/session";
import { createLocationAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.locations" });
  return { title: t("new") };
}

/** Ny lokation (MANAGER+). Åbningstider og zoner sættes bagefter på lokationens side. */
export default async function NewLocationPage() {
  setRequestLocale("da");
  await requirePermission("catalog:write");
  const t = await getTranslations("admin.locations");
  return (
    <>
      <Link
        href="/admin/locations"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("new")}</h1>
      <Card>
        <CardBody>
          <LocationForm
            action={createLocationAction}
            defaults={{
              type: "OFFICE",
              country: "DK",
              timezone: "Europe/Copenhagen",
              bufferBeforeMinutes: "60",
              bufferAfterMinutes: "120",
              isActive: "on",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
