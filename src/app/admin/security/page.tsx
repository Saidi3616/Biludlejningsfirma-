import { getTranslations, setRequestLocale } from "next-intl/server";
import { adminPermissionList, can } from "@/server/auth/policies";
import { requiresTwoFactor } from "@/server/auth/roles";
import { requireStaff } from "@/server/auth/session";
import { Alert } from "@/components/ui/alert";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { TwoFactorSetup } from "@/components/features/admin/two-factor-setup";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.security" });
  return { title: t("title") };
}

/** 2FA-opsætning og overblik over rollens adgang. Ledere sendes hertil, indtil 2FA er slået til. */
export default async function AdminSecurityPage() {
  setRequestLocale("da");
  const user = await requireStaff({ allowMissingTwoFactor: true });
  const t = await getTranslations("admin.security");
  const tAdmin = await getTranslations("admin");

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-4">
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
      <section aria-labelledby="access" className="flex flex-col gap-3">
        <h2 id="access" className="text-lg font-semibold text-ink-900">
          {tAdmin("dashboard.permissionsTitle")}
        </h2>
        <p className="text-muted">
          {tAdmin("dashboard.role", { role: tAdmin(`roles.${user.role}`) })}
        </p>
        <Table label={tAdmin("dashboard.permissionsTitle")} className="bg-white">
          <THead>
            <TR>
              <TH>{tAdmin("dashboard.permission")}</TH>
              <TH>{tAdmin("dashboard.allowed")}</TH>
            </TR>
          </THead>
          <tbody>
            {adminPermissionList.map((permission) => {
              const allowed = can({ actor: user }, permission);
              return (
                <TR key={permission}>
                  <TD>{tAdmin(`dashboard.permissions.${permission}`)}</TD>
                  <TD className={allowed ? "font-medium text-success-700" : "text-muted"}>
                    {allowed ? tAdmin("dashboard.yes") : tAdmin("dashboard.no")}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
