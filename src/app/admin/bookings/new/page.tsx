import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { PhoneBookingForm } from "@/components/features/admin/phone-booking-form";
import { addDaysToKey, localDateKey } from "@/lib/dates";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { phoneBookingOptions } from "@/server/admin/phone-booking";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { createPhoneBookingAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.newBooking" });
  return { title: t("title") };
}

/** F3: telefon- og skrankebooking. */
export default async function NewBookingPage() {
  setRequestLocale("da");
  await requirePermission("booking:write");
  const [t, options] = await Promise.all([
    getTranslations("admin.newBooking"),
    getPolicyContext().then(phoneBookingOptions),
  ]);
  const tomorrow = addDaysToKey(localDateKey(new Date(), ADMIN_TIME_ZONE), 1);

  return (
    <>
      <Link
        href="/admin/bookings"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>
      <Card>
        <CardBody>
          <PhoneBookingForm
            action={createPhoneBookingAction}
            options={options}
            defaults={{ pickupDate: tomorrow, returnDate: addDaysToKey(tomorrow, 3) }}
          />
        </CardBody>
      </Card>
    </>
  );
}
