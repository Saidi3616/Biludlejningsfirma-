import "server-only";
import { createTranslator } from "next-intl";
import { localizedPath } from "@/i18n/paths";
import type { Locale } from "@/i18n/routing";
import { site, whatsappLink } from "@/config/site";
import { formatDateTime, formatMoney } from "@/lib/format";
import { renderEmail } from "@/server/email/layout";
import type { Email } from "@/server/email/send";
import da from "../../../messages/da.json";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import fr from "../../../messages/fr.json";
import type { NotificationTemplate } from "./templates";

const messages = { da, en, ar, fr } satisfies Record<Locale, typeof da>;

type Place = { name: string; address: string; city: string; timezone: string };

/** Det, en besked må vise. Hentes fra bookingen ved afsendelsen, så rækkerne ikke rummer persondata. */
export type NotificationContext = {
  reference: string;
  firstName: string;
  email: string;
  carName: string;
  pickupAt: Date;
  returnAt: Date;
  pickupLocation: Place;
  returnLocation: Place;
  deliveryAddress: string | null;
  totalMinor: number;
  paidMinor: number;
  depositMinor: number;
  currency: string;
};

export type RenderedNotification = { email: Email; whatsappParameters: string[] };

export function renderNotification(
  template: NotificationTemplate,
  locale: Locale,
  ctx: NotificationContext,
  baseUrl: string,
): RenderedNotification {
  const t = createTranslator({ locale, messages: messages[locale], namespace: "notifications" });
  const money = (amount: number) => formatMoney(amount, ctx.currency, locale);
  const pickupTime = formatDateTime(ctx.pickupAt, locale, ctx.pickupLocation.timezone);
  const returnTime = formatDateTime(ctx.returnAt, locale, ctx.returnLocation.timezone);
  const address = (place: Place) => `${place.name}, ${place.address}, ${place.city}`;

  const rows = {
    reference: { label: t("common.reference"), value: ctx.reference },
    car: { label: t("common.car"), value: ctx.carName },
    pickup: {
      label: t("common.pickup"),
      value: `${pickupTime} · ${ctx.deliveryAddress ?? address(ctx.pickupLocation)}`,
    },
    return: { label: t("common.return"), value: `${returnTime} · ${address(ctx.returnLocation)}` },
    paid: { label: t("common.paid"), value: money(ctx.paidMinor) },
  };
  const bring =
    ctx.depositMinor > 0
      ? t("common.bringWithDeposit", { deposit: money(ctx.depositMinor) })
      : t("common.bring");
  const whatsappButton = {
    label: t("common.whatsappButton"),
    url: whatsappLink(t("common.whatsappPrefill", { reference: ctx.reference })),
  };
  const reviewUrl = new URL(localizedPath(locale, "/reviews"), baseUrl).toString();

  const content = {
    BOOKING_CONFIRMED: {
      paragraphs: [t("BOOKING_CONFIRMED.intro", { amount: money(ctx.paidMinor) })],
      details: [rows.reference, rows.car, rows.pickup, rows.return, rows.paid],
      closing: [bring, t("common.questions")],
      button: whatsappButton,
      whatsapp: [ctx.firstName, ctx.reference, ctx.carName, pickupTime, ctx.pickupLocation.name],
    },
    PAYMENT_RECEIVED: {
      paragraphs: [
        t("PAYMENT_RECEIVED.intro", { amount: money(ctx.paidMinor), reference: ctx.reference }),
      ],
      details: [rows.reference, rows.paid],
      closing: [t("common.questions")],
      button: undefined,
      whatsapp: [ctx.firstName, money(ctx.paidMinor), ctx.reference],
    },
    CAR_READY: {
      paragraphs: [t("CAR_READY.intro", { car: ctx.carName })],
      details: [rows.reference, rows.pickup],
      closing: [bring, t("common.questions")],
      button: whatsappButton,
      whatsapp: [ctx.firstName, ctx.carName, ctx.pickupLocation.name],
    },
    PICKUP_REMINDER: {
      paragraphs: [t("PICKUP_REMINDER.intro")],
      details: [rows.reference, rows.car, rows.pickup],
      closing: [bring, t("common.questions")],
      button: whatsappButton,
      whatsapp: [ctx.firstName, ctx.carName, pickupTime, address(ctx.pickupLocation)],
    },
    RETURN_REMINDER: {
      paragraphs: [
        t("RETURN_REMINDER.intro", { time: returnTime, location: ctx.returnLocation.name }),
      ],
      details: [rows.reference, rows.return],
      closing: [t("RETURN_REMINDER.fuel"), t("common.questions")],
      button: whatsappButton,
      whatsapp: [ctx.firstName, returnTime, ctx.returnLocation.name],
    },
    THANK_YOU: {
      paragraphs: [t("THANK_YOU.intro")],
      details: [rows.reference],
      closing: [t("THANK_YOU.deposit"), t("common.questions")],
      button: undefined,
      whatsapp: [ctx.firstName],
    },
    REVIEW_REQUEST: {
      paragraphs: [t("REVIEW_REQUEST.intro")],
      details: [],
      closing: [],
      button: { label: t("REVIEW_REQUEST.button"), url: reviewUrl },
      whatsapp: [ctx.firstName, reviewUrl],
    },
  }[template];

  const subject = t(`${template}.subject`, { reference: ctx.reference });
  const { html, text } = renderEmail({
    locale,
    preheader: content.paragraphs[0] ?? subject,
    // Bookingnummeret isoleres som venstre-mod-højre, så "BK-" ikke vendes i arabisk tekst.
    heading: t(`${template}.subject`, { reference: `\u2066${ctx.reference}\u2069` }),
    greeting: t("common.greeting", { name: ctx.firstName }),
    paragraphs: content.paragraphs,
    details: content.details,
    button: content.button,
    closing: content.closing,
    signature: t("common.signature", { company: site.name }),
    footer: t("common.footer", { company: site.name }),
  });

  return { email: { to: ctx.email, subject, html, text }, whatsappParameters: content.whatsapp };
}
