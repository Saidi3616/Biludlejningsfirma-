import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { InviteForm } from "@/components/features/admin/invite-form";
import { requirePermission } from "@/server/auth/session";
import { inviteStaffAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.users" });
  return { title: t("invite") };
}

/** Invitér en medarbejder (SUPER_ADMIN). */
export default async function InvitePage() {
  setRequestLocale("da");
  await requirePermission("users:manage");
  const t = await getTranslations("admin.users");
  return (
    <>
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("invite")}</h1>
      <Card>
        <CardBody>
          <InviteForm action={inviteStaffAction} />
        </CardBody>
      </Card>
    </>
  );
}
