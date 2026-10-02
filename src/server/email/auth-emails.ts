import "server-only";
import { createTranslator } from "next-intl";
import { hasLocale } from "next-intl";
import { directionOf, routing, type Locale } from "@/i18n/routing";
import { site } from "@/config/site";
import da from "../../../messages/da.json";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import fr from "../../../messages/fr.json";
import type { Email } from "./send";

const messages = { da, en, ar, fr } satisfies Record<Locale, typeof da>;

export type AuthEmailKind = "verify" | "reset" | "existing";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function emailLocale(value: unknown): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

/**
 * E-mails til login-flowet på modtagerens sprog. Enkel HTML (ét link som knap) plus
 * tekstversion; designede skabeloner kommer med notifikationerne i M8.
 */
export function authEmail(
  kind: AuthEmailKind,
  input: { to: string; name: string; url: string; locale: unknown },
): Email {
  const locale = emailLocale(input.locale);
  const t = createTranslator({ locale, messages: messages[locale], namespace: "email" });
  const lines = {
    subject: t(`${kind}.subject`),
    greeting: t("greeting", { name: input.name }),
    body: t(`${kind}.body`),
    button: t(`${kind}.button`),
    note: t(`${kind}.note`),
    signature: t("signature", { company: site.name }),
  };

  const text = [
    lines.greeting,
    "",
    lines.body,
    "",
    `${lines.button}: ${input.url}`,
    "",
    lines.note,
    "",
    lines.signature,
  ].join("\n");

  const html = `<!doctype html>
<html lang="${locale}" dir="${directionOf(locale)}">
<body style="margin:0;padding:24px;background:#f6f7f8;font-family:system-ui,sans-serif;color:#14181b">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px">
    <p style="margin:0 0 16px">${escapeHtml(lines.greeting)}</p>
    <p style="margin:0 0 24px;line-height:1.5">${escapeHtml(lines.body)}</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#114853;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(lines.button)}</a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#4b545d;line-height:1.5">${escapeHtml(lines.note)}</p>
    <p style="margin:0;font-size:14px;color:#4b545d">${escapeHtml(lines.signature)}</p>
  </div>
</body>
</html>`;

  return { to: input.to, subject: lines.subject, text, html };
}
