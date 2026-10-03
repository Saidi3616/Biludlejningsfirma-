import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { listStaff } from "@/server/admin/users";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.users" });
  return { title: t("title") };
}

const STATUS_TONE = { active: "success", invited: "warning", disabled: "neutral" } as const;

/** Medarbejdere og roller (F11). Kun SUPER_ADMIN. */
export default async function UsersPage() {
  setRequestLocale("da");
  const me = await requirePermission("users:manage");
  const [t, ctx] = await Promise.all([getTranslations("admin.users"), getPolicyContext()]);
  const users = await listStaff(ctx);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        <Button asChild>
          <Link href="/admin/users/new">
            <UserPlus aria-hidden />
            {t("invite")}
          </Link>
        </Button>
      </div>
      <p className="text-muted">{t("intro")}</p>

      {users.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Table label={t("title")} className="bg-white">
          <THead>
            <TR>
              <TH>{t("columns.name")}</TH>
              <TH>{t("columns.role")}</TH>
              <TH>{t("columns.twoFactor")}</TH>
              <TH>{t("columns.lastLogin")}</TH>
              <TH>{t("columns.status")}</TH>
            </TR>
          </THead>
          <tbody>
            {users.map((user) => (
              <TR key={user.id}>
                <TD>
                  <span className="flex flex-col">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium text-brand-700 underline"
                    >
                      {user.name}
                      {user.id === me.userId ? ` (${t("you")})` : null}
                    </Link>
                    <span className="text-sm text-muted" dir="ltr">
                      {user.email}
                    </span>
                  </span>
                </TD>
                <TD>{t(`roles.${user.role as "STAFF" | "MANAGER" | "SUPER_ADMIN"}`)}</TD>
                <TD>{user.twoFactorEnabled ? t("on") : t("off")}</TD>
                <TD>
                  {user.lastLoginAt
                    ? formatDateTime(user.lastLoginAt, "da", ADMIN_TIME_ZONE)
                    : t("never")}
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[user.status]}>{t(`status.${user.status}`)}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
