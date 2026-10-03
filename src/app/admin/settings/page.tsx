import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { SettingsForm } from "@/components/features/admin/settings-form";
import { adminSettings } from "@/server/admin/settings";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.settings" });
  return { title: t("title") };
}

/** Firmaoplysninger (SUPER_ADMIN, 04-sitemap). */
export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  setRequestLocale("da");
  await requirePermission("settings:write");
  const [t, settings, search] = await Promise.all([
    getTranslations("admin.settings"),
    getPolicyContext().then(adminSettings),
    searchParams,
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      <p className="max-w-3xl text-base text-muted">{t("intro")}</p>
      {search.notice === "saved" ? <Alert tone="success">{t("notices.saved")}</Alert> : null}
      <Card>
        <CardBody>
          <SettingsForm
            action={updateSettingsAction}
            defaults={{
              phone: settings.phone,
              email: settings.email,
              whatsappNumber: `+${settings.whatsappNumber}`,
              address: settings.address ?? "",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
