import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ContactButtons } from "@/components/features/admin/contact-buttons";
import { MessageForm } from "@/components/features/admin/message-form";
import { formatDateTime } from "@/lib/format";
import { AppError } from "@/lib/errors";
import { adminBooking, type AdminBooking } from "@/server/admin/bookings";
import { ADMIN_TIME_ZONE } from "@/server/admin/dashboard";
import { can } from "@/server/auth/policies";
import { getPolicyContext, requirePermission } from "@/server/auth/session";
import { notificationTemplates, type NotificationTemplate } from "@/server/notifications/templates";
import { sendMessageAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/admin/bookings/[reference]">) {
  const { reference } = await params;
  return { title: reference };
}

async function load(reference: string) {
  try {
    return await adminBooking(await getPolicyContext(), reference);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

/** Én booking i admin: kunde, leje, betaling, historik og beskeder (kerneopgave 3, 4, 5, 9). */
export default async function AdminBookingPage({
  params,
}: PageProps<"/admin/bookings/[reference]">) {
  setRequestLocale("da");
  const user = await requirePermission("booking:read");
  const { reference } = await params;
  const booking = await load(reference);
  const t = await getTranslations("admin.booking");
  const tLines = await getTranslations("car.lines");
  const tRental = await getTranslations("booking");
  const zone = booking.pickupLocation.timezone;
  const when = (date: Date) => formatDateTime(date, "da", ADMIN_TIME_ZONE);
  const itemLabel = (item: AdminBooking["items"][number]) => {
    if (item.type === "RENTAL") return tRental("rental");
    if (item.type === "EXTRA")
      return item.quantity > 1 ? `${item.labelSnapshot} × ${item.quantity}` : item.labelSnapshot;
    if (["DELIVERY_FEE", "ONE_WAY_FEE", "DISCOUNT", "FEE"].includes(item.type)) {
      return tLines(item.type as "DELIVERY_FEE");
    }
    return item.labelSnapshot;
  };

  return (
    <>
      <Link
        href="/admin/bookings"
        className="inline-flex items-center gap-2 self-start text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {t("title", { reference: booking.reference })}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="booking" status={booking.status} />
          <StatusBadge kind="payment" status={booking.paymentStatus} />
          <span className="text-sm text-muted">
            {t("created", { date: when(booking.createdAt) })}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="rental" className="flex flex-col gap-3">
            <h2 id="rental" className="text-lg font-semibold text-ink-900">
              {t("rentalTitle")}
            </h2>
            <Card>
              <CardBody className="flex flex-col gap-4">
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-muted">{t("car")}</dt>
                    <dd className="font-medium text-ink-900">
                      {booking.carModel.brand} {booking.carModel.model} ·{" "}
                      {booking.car.registrationNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t("fulfilment")}</dt>
                    <dd className="font-medium text-ink-900">
                      {booking.deliveryAddress
                        ? t("delivery", { address: booking.deliveryAddress })
                        : t("pickupAtOffice")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t("pickup")}</dt>
                    <dd className="font-medium text-ink-900">
                      {formatDateTime(booking.pickupAt, "da", zone)} · {booking.pickupLocation.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t("return")}</dt>
                    <dd className="font-medium text-ink-900">
                      {formatDateTime(booking.returnAt, "da", booking.returnLocation.timezone)} ·{" "}
                      {booking.returnLocation.name}
                    </dd>
                  </div>
                  {booking.discount ? (
                    <div>
                      <dt className="text-sm text-muted">{t("discount")}</dt>
                      <dd className="font-medium text-ink-900">{booking.discount.code}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-sm text-muted">{t("deposit")}</dt>
                    <dd className="font-medium text-ink-900">
                      <Price amountMinor={booking.depositMinor} currency={booking.currency} /> ·{" "}
                      {t(`depositStatus.${booking.depositStatus}`)}
                    </dd>
                  </div>
                </dl>
                <dl className="flex flex-col gap-2 border-t border-border pt-4">
                  {booking.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-4">
                      <dt className="text-ink-700">{itemLabel(item)}</dt>
                      <dd className="font-medium text-ink-900">
                        <Price amountMinor={item.totalMinor} currency={booking.currency} />
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold">
                    <dt>{t("total")}</dt>
                    <dd>
                      <Price amountMinor={booking.totalMinor} currency={booking.currency} />
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          </section>

          <section aria-labelledby="payments" className="flex flex-col gap-3">
            <h2 id="payments" className="text-lg font-semibold text-ink-900">
              {t("paymentsTitle")}
            </h2>
            {booking.payments.length === 0 ? (
              <p className="text-muted">{t("noPayments")}</p>
            ) : (
              <Table label={t("paymentsTitle")} className="bg-white">
                <THead>
                  <TR>
                    <TH>{t("columns.date")}</TH>
                    <TH>{t("columns.kind")}</TH>
                    <TH>{t("columns.status")}</TH>
                    <TH>{t("columns.method")}</TH>
                    <TH className="text-end">{t("columns.amount")}</TH>
                  </TR>
                </THead>
                <tbody>
                  {booking.payments.map((payment) => (
                    <TR key={payment.id}>
                      <TD className="whitespace-nowrap">{when(payment.createdAt)}</TD>
                      <TD>{t(`paymentKinds.${payment.kind}`)}</TD>
                      <TD>{t(`paymentStatus.${payment.status}`)}</TD>
                      <TD className="whitespace-nowrap">
                        {payment.cardLast4
                          ? `${payment.cardBrand ?? ""} •••• ${payment.cardLast4}`
                          : payment.method
                            ? t(`methods.${payment.method}`)
                            : "–"}
                      </TD>
                      <TD className="text-end font-medium whitespace-nowrap">
                        <Price amountMinor={payment.amountMinor} currency={payment.currency} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section aria-labelledby="history" className="flex flex-col gap-3">
            <h2 id="history" className="text-lg font-semibold text-ink-900">
              {t("historyTitle")}
            </h2>
            <ol className="flex flex-col gap-2">
              {booking.statusEvents.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">{when(event.createdAt)}</span>
                  <Badge>
                    {event.fromStatus ? `${event.fromStatus} → ` : ""}
                    {event.toStatus}
                  </Badge>
                  <span className="text-ink-700">
                    {event.actor?.name ?? t("system")}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="messages" className="flex flex-col gap-3">
            <h2 id="messages" className="text-lg font-semibold text-ink-900">
              {t("messagesTitle")}
            </h2>
            {booking.notifications.length === 0 && booking.messages.length === 0 ? (
              <p className="text-muted">{t("noMessages")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-white">
                {booking.messages.map((message) => (
                  <li key={message.id} className="flex flex-col gap-1 p-3 text-sm">
                    <span className="font-medium text-ink-900">
                      {message.subject ?? t(`channels.${message.channel}`)}
                    </span>
                    <span className="text-muted">
                      {when(message.createdAt)} · {t(`direction.${message.direction}`)}
                      {message.assignedUser ? ` · ${message.assignedUser.name}` : ""}
                    </span>
                    <p className="whitespace-pre-line text-ink-700">{message.body}</p>
                  </li>
                ))}
                {booking.notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className="flex flex-wrap items-center gap-2 p-3 text-sm"
                  >
                    <span className="font-medium text-ink-900">
                      {notification.template in notificationTemplates
                        ? t(`templates.${notification.template as NotificationTemplate}`)
                        : notification.template}
                    </span>
                    <Badge>{t(`channels.${notification.channel}`)}</Badge>
                    <Badge tone={notification.status === "FAILED" ? "danger" : "neutral"}>
                      {t(`notificationStatus.${notification.status}`)}
                    </Badge>
                    <span className="text-muted">
                      {when(notification.sentAt ?? notification.scheduledAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {can({ actor: user }, "message:send") && !booking.customer.anonymizedAt ? (
            <section aria-labelledby="send" className="flex flex-col gap-3">
              <h2 id="send" className="text-lg font-semibold text-ink-900">
                {t("message.title")}
              </h2>
              <Card>
                <CardBody>
                  <MessageForm action={sendMessageAction} reference={booking.reference} />
                </CardBody>
              </Card>
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="customer" className="flex flex-col gap-3 lg:sticky lg:top-6">
          <h2 id="customer" className="text-lg font-semibold text-ink-900">
            {t("customerTitle")}
          </h2>
          <Card>
            <CardBody className="flex flex-col gap-3">
              <Link
                href={`/admin/customers/${booking.customer.id}`}
                className="text-lg font-semibold text-brand-700 underline"
              >
                {booking.customer.firstName} {booking.customer.lastName}
              </Link>
              <dl className="flex flex-col gap-2 text-sm">
                <div>
                  <dt className="text-muted">{t("email")}</dt>
                  <dd className="break-all text-ink-900">{booking.customer.email}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("phone")}</dt>
                  <dd className="text-ink-900">{booking.customer.phoneE164 ?? "–"}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("language")}</dt>
                  <dd className="text-ink-900">{booking.locale.toUpperCase()}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t("account")}</dt>
                  <dd className="text-ink-900">
                    {booking.customer.userId ? t("hasAccount") : t("guest")}
                  </dd>
                </div>
              </dl>
              <ContactButtons
                phone={booking.customer.phoneE164}
                email={booking.customer.email}
                whatsappText={t("whatsappPrefill", {
                  name: booking.customer.firstName,
                  reference: booking.reference,
                })}
                labels={{ call: t("call"), whatsapp: t("whatsapp"), email: t("sendEmail") }}
              />
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
