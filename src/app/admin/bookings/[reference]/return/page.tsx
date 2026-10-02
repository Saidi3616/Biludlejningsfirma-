import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HANDOVER_NOTICES, HandoverForm } from "@/components/features/admin/handover-form";
import { AppError } from "@/lib/errors";
import { handoverContext } from "@/server/inspections/service";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { returnAction } from "@/app/admin/inspections/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.handover" });
  return { title: t("return.title") };
}

/** Aflevering af bilen ved skranken eller på parkeringspladsen. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/bookings/[reference]/return">) {
  setRequestLocale("da");
  await requirePermission("inspection:write");
  const [{ reference }, search] = await Promise.all([params, searchParams]);
  const found = await db.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    select: { id: true },
  });
  if (!found) notFound();
  let booking;
  try {
    booking = await handoverContext(await getPolicyContext(), found.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const notice = HANDOVER_NOTICES.find((value) => value === search.notice) ?? null;
  return <HandoverForm type="return" booking={booking} action={returnAction} notice={notice} />;
}
