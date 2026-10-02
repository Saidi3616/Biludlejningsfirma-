import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Mail, UserCheck, UserX } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { staffRoles } from "@/lib/validation/users";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { staffUser } from "@/server/admin/users";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import {
  changeRoleAction,
  disableStaffAction,
  enableStaffAction,
  resendInviteAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.users" });
  return { title: t("title") };
}

const NOTICES = [
  "invited",
  "inviteNotSent",
  "reinvited",
  "roleSaved",
  "disabled",
  "enabled",
  "self",
  "lastSuperAdmin",
  "forbidden",
  "failed",
] as const;
const FAILURES = new Set(["inviteNotSent", "self", "lastSuperAdmin", "forbidden", "failed"]);
const STATUS_TONE = { active: "success", invited: "warning", disabled: "neutral" } as const;

/** Én medarbejder: rolle, invitation og adgang (F11). */
export default async function UserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  setRequestLocale("da");
  await requirePermission("users:manage");
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await staffUser(await getPolicyContext(), id).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const t = await getTranslations("admin.users");
  const notice = NOTICES.find((value) => value === search.notice) ?? null;
  const date = (value: Date | null) =>
    value ? formatDateTime(value, "da", ADMIN_TIME_ZONE) : t("never");

  return (
    <>
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{user.name}</h1>
        <Badge tone={STATUS_TONE[user.status]}>{t(`status.${user.status}`)}</Badge>
      </div>
      {notice ? (
        <Alert tone={FAILURES.has(notice) ? "danger" : "success"}>{t(`notices.${notice}`)}</Alert>
      ) : null}

      <Card>
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">{t("form.email")}</dt>
              <dd dir="ltr" className="text-start">
                {user.email}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("detail.twoFactor")}</dt>
              <dd>{user.twoFactorEnabled ? t("on") : t("off")}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("detail.lastLogin")}</dt>
              <dd>{date(user.lastLoginAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("detail.created")}</dt>
              <dd>{date(user.createdAt)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {user.isSelf ? (
        <Alert tone="info">{t("detail.selfNote")}</Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("detail.role")}</CardTitle>
            </CardHeader>
            <CardBody>
              <form action={changeRoleAction} className="flex flex-col gap-4">
                <input type="hidden" name="userId" value={user.id} />
                <RadioGroup legend={t("detail.role")}>
                  {staffRoles.map((role) => (
                    <Radio
                      key={role}
                      name="role"
                      value={role}
                      label={t(`roles.${role}`)}
                      description={t(`roleHints.${role}`)}
                      defaultChecked={user.role === role}
                    />
                  ))}
                </RadioGroup>
                <Button type="submit" className="self-start">
                  {t("detail.saveRole")}
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("detail.access")}</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {user.status === "invited" ? (
                <form action={resendInviteAction} className="flex flex-col gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <p className="text-sm text-muted">{t("detail.invitedHint")}</p>
                  <Button type="submit" variant="secondary" className="self-start">
                    <Mail aria-hidden />
                    {t("detail.resend")}
                  </Button>
                </form>
              ) : null}
              {user.disabledAt ? (
                <form action={enableStaffAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <Button type="submit" variant="secondary">
                    <UserCheck aria-hidden />
                    {t("detail.enable")}
                  </Button>
                </form>
              ) : (
                <form action={disableStaffAction} className="flex flex-col gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <p className="text-sm text-muted">{t("detail.disableHint")}</p>
                  <Button type="submit" variant="danger" className="self-start">
                    <UserX aria-hidden />
                    {t("detail.disable")}
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
