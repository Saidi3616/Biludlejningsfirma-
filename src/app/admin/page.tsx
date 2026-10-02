import { getTranslations, setRequestLocale } from "next-intl/server";
import { adminPermissionList, can } from "@/server/auth/policies";
import { requirePermission } from "@/server/auth/session";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.dashboard" });
  return { title: t("title") };
}

// Midlertidigt overblik. Dashboard med dagens udleveringer/afleveringer kommer i M10.
export default async function AdminDashboardPage() {
  setRequestLocale("da");
  const user = await requirePermission("admin:access");
  const t = await getTranslations("admin");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {t("dashboard.title")}
        </h1>
        <p className="mt-2 text-muted">{t("dashboard.intro")}</p>
        <p className="mt-2 font-medium text-ink-900">
          {t("dashboard.role", { role: t(`roles.${user.role}`) })}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink-900">{t("dashboard.permissionsTitle")}</h2>
        <Table label={t("dashboard.permissionsTitle")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("dashboard.permission")}</TH>
              <TH>{t("dashboard.allowed")}</TH>
            </TR>
          </THead>
          <tbody>
            {adminPermissionList.map((permission) => {
              const allowed = can({ actor: user }, permission);
              return (
                <TR key={permission}>
                  <TD>{t(`dashboard.permissions.${permission}`)}</TD>
                  <TD className={allowed ? "font-medium text-success-700" : "text-muted"}>
                    {allowed ? t("dashboard.yes") : t("dashboard.no")}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>
    </>
  );
}
