import { getTranslations, setRequestLocale } from "next-intl/server";
import { requiresTwoFactor } from "@/server/auth/roles";
import { requireStaff } from "@/server/auth/session";
import { Alert } from "@/components/ui/alert";
import { TwoFactorSetup } from "@/components/features/admin/two-factor-setup";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.security" });
  return { title: t("title") };
}

/** 2FA-opsætning. Ledere sendes hertil, indtil 2FA er slået til. */
export default async function AdminSecurityPage() {
  setRequestLocale("da");
  const user = await requireStaff({ allowMissingTwoFactor: true });
  const t = await getTranslations("admin.security");

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
      {user.twoFactorEnabled ? (
        <Alert tone="success">{t("enabled")}</Alert>
      ) : (
        <>
          <Alert tone={requiresTwoFactor(user.role) ? "warning" : "info"}>
            {requiresTwoFactor(user.role) ? t("required") : t("disabledInfo")}
          </Alert>
          <TwoFactorSetup />
        </>
      )}
    </div>
  );
}
