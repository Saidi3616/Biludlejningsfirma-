import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ContactButtons } from "@/components/features/admin/contact-buttons";
import { AppError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { adminCustomer } from "@/server/admin/customers";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { getPolicyContext, requirePermission } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations({ locale: "da", namespace: "admin.customer" });
  return { title: t("metaTitle") };
}

/** Kundens profil, bookinger og kommunikation. GDPR-handlinger kommer i M15. */
export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  setRequestLocale("da");
  await requirePermission("customer:read");
  const { id } = await params;
  let customer;
  try {
    customer = await adminCustomer(await getPolicyContext(), id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const t = await getTranslations("admin.customer");
  const tBooking = await getTranslations("admin.booking");
  const name = customer.anonymizedAt
    ? t("anonymized")
    : `${customer.firstName} ${customer.lastName}`;

  return (
    <>
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{name}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="bookings" className="flex flex-col gap-3">
            <h2 id="bookings" className="text-lg font-semibold text-ink-900">
              {t("bookingsTitle", { count: customer.bookings.length })}
            </h2>
            {customer.bookings.length === 0 ? (
              <p className="text-muted">{t("noBookings")}</p>
            ) : (
              <Table
                label={t("bookingsTitle", { count: customer.bookings.length })}
                className="bg-white"
              >
                <THead>
                  <TR>
                    <TH>{t("columns.reference")}</TH>
                    <TH>{t("columns.car")}</TH>
                    <TH>{t("columns.pickup")}</TH>
                    <TH>{t("columns.status")}</TH>
                    <TH className="text-end">{t("columns.total")}</TH>
                  </TR>
                </THead>
                <tbody>
                  {customer.bookings.map((booking) => (
                    <TR key={booking.reference}>
                      <TD>
                        <Link
                          href={`/admin/bookings/${booking.reference}`}
                          className="font-medium whitespace-nowrap text-brand-700 underline"
                        >
                          {booking.reference}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap">
                        {booking.carModel.brand} {booking.carModel.model}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {formatDateTime(booking.pickupAt, "da", booking.pickupLocation.timezone)}
                      </TD>
                      <TD>
                        <span className="flex flex-wrap gap-1">
                          <StatusBadge kind="booking" status={booking.status} />
                          <StatusBadge kind="payment" status={booking.paymentStatus} />
                        </span>
                      </TD>
                      <TD className="text-end whitespace-nowrap">
                        <Price amountMinor={booking.totalMinor} currency={booking.currency} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section aria-labelledby="messages" className="flex flex-col gap-3">
            <h2 id="messages" className="text-lg font-semibold text-ink-900">
              {t("messagesTitle")}
            </h2>
            {customer.messages.length === 0 ? (
              <p className="text-muted">{t("noMessages")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-white">
                {customer.messages.map((message) => (
                  <li key={message.id} className="flex flex-col gap-1 p-3 text-sm">
                    <span className="font-medium text-ink-900">
                      {message.subject ?? tBooking(`channels.${message.channel}`)}
                    </span>
                    <span className="text-muted">
                      {formatDateTime(message.createdAt, "da", ADMIN_TIME_ZONE)} ·{" "}
                      {tBooking(`direction.${message.direction}`)}
                    </span>
                    <p className="whitespace-pre-line text-ink-700">{message.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside aria-labelledby="profile" className="flex flex-col gap-3">
          <h2 id="profile" className="text-lg font-semibold text-ink-900">
            {t("profileTitle")}
          </h2>
          <Card>
            <CardBody className="flex flex-col gap-3">
              <dl className="flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-muted">{tBooking("email")}</dt>
                  <dd className="break-all text-ink-900">{customer.email}</dd>
                </div>
                <div>
                  <dt className="text-muted">{tBooking("phone")}</dt>
                  <dd className="text-ink-900">{customer.phoneE164 ?? "–"}</dd>
                </div>
                <div>
                  <dt className="text-muted">{tBooking("language")}</dt>
                  <dd className="text-ink-900">{customer.preferredLocale.toUpperCase()}</dd>
                </div>
                <div>
                  <dt className="text-muted">{tBooking("account")}</dt>
                  <dd className="text-ink-900">
                    {customer.user
                      ? customer.user.lastLoginAt
                        ? t("lastLogin", {
                            date: formatDate(customer.user.lastLoginAt, "da", ADMIN_TIME_ZONE),
                          })
                        : tBooking("hasAccount")
                      : tBooking("guest")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t("created")}</dt>
                  <dd className="text-ink-900">
                    {formatDate(customer.createdAt, "da", ADMIN_TIME_ZONE)}
                  </dd>
                </div>
              </dl>
              {customer.anonymizedAt ? null : (
                <ContactButtons
                  phone={customer.phoneE164}
                  email={customer.email}
                  whatsappText={t("whatsappPrefill", { name: customer.firstName })}
                  labels={{
                    call: tBooking("call"),
                    whatsapp: tBooking("whatsapp"),
                    email: tBooking("sendEmail"),
                  }}
                />
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
