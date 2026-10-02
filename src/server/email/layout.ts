import "server-only";
import { directionOf, type Locale } from "@/i18n/routing";

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type EmailContent = {
  locale: Locale;
  preheader: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  /** Fx bookingnummer, bil og tider. */
  details?: { label: string; value: string }[];
  button?: { label: string; url: string };
  /** Sekundært link under knappen, fx "Se eller annullér din booking". */
  link?: { label: string; url: string };
  closing: string[];
  signature: string;
  footer: string;
};

/**
 * Fælles e-maillayout: enkel HTML med inline-styles (virker i Outlook, Gmail og Apple Mail),
 * højre-til-venstre på arabisk, og en tekstversion med det samme indhold.
 */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  const dir = directionOf(content.locale);
  const align = dir === "rtl" ? "right" : "left";
  const muted = "color:#4b545d;font-size:14px;line-height:1.5";

  const details = content.details?.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;background:#f6f7f8;border-radius:10px">
${content.details
  .map(
    (row) =>
      `<tr><td style="padding:10px 14px;${muted};width:40%;vertical-align:top;text-align:${align}">${escapeHtml(row.label)}</td><td style="padding:10px 14px;font-weight:600;vertical-align:top;text-align:${align}">${escapeHtml(row.value)}</td></tr>`,
  )
  .join("\n")}
</table>`
    : "";

  const button = content.button
    ? `<p style="margin:0 0 24px"><a href="${escapeHtml(content.button.url)}" style="display:inline-block;background:#114853;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(content.button.label)}</a></p>`
    : "";

  const link = content.link
    ? `<p style="margin:0 0 24px"><a href="${escapeHtml(content.link.url)}" style="color:#114853;font-weight:600">${escapeHtml(content.link.label)}</a></p>`
    : "";

  const paragraph = (text: string) =>
    `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(text)}</p>`;

  const html = `<!doctype html>
<html lang="${content.locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f6f7f8;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#14181b;text-align:${align}">
  <span style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preheader)}</span>
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px">
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3">${escapeHtml(content.heading)}</h1>
    ${paragraph(content.greeting)}
    ${content.paragraphs.map(paragraph).join("\n    ")}
    ${details}
    ${button}
    ${link}
    ${content.closing.map(paragraph).join("\n    ")}
    <p style="margin:0;${muted}">${escapeHtml(content.signature)}</p>
  </div>
  <p style="max-width:560px;margin:16px auto 0;${muted};font-size:12px">${escapeHtml(content.footer)}</p>
</body>
</html>`;

  const text = [
    content.heading,
    "",
    content.greeting,
    "",
    ...content.paragraphs.flatMap((line) => [line, ""]),
    ...(content.details ?? []).map((row) => `${row.label}: ${row.value}`),
    ...(content.details?.length ? [""] : []),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ""] : []),
    ...(content.link ? [`${content.link.label}: ${content.link.url}`, ""] : []),
    ...content.closing.flatMap((line) => [line, ""]),
    content.signature,
    "",
    "--",
    content.footer,
  ].join("\n");

  return { html, text };
}
