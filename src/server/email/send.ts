import "server-only";
import nodemailer from "nodemailer";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailTransport = { name: string; send: (email: Email, from: string) => Promise<void> };

/** Resend via deres HTTP-API (EU-region vælges i Resend-kontoen). */
function resendTransport(apiKey: string): EmailTransport {
  return {
    name: "resend",
    async send(email, from) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, ...email }),
      });
      if (!response.ok) throw new Error(`E-mailudbyder svarede ${response.status}`);
    },
  };
}

/** Lokalt: Mailpit fra docker compose (se mails på http://localhost:8025). */
function smtpTransport(url: string): EmailTransport {
  const transporter = nodemailer.createTransport(url);
  return {
    name: "smtp",
    async send(email, from) {
      await transporter.sendMail({ from, ...email });
    },
  };
}

/** Uden udbyder (lokalt uden Mailpit, CI): intet sendes. Modtager og indhold logges ikke. */
const disabledTransport: EmailTransport = {
  name: "disabled",
  async send(email) {
    logger.warn({ subject: email.subject }, "E-mail ikke sendt: ingen e-mailudbyder sat op");
  },
};

let override: EmailTransport | undefined;
let cached: EmailTransport | undefined;

function transport(): EmailTransport {
  if (override) return override;
  if (cached) return cached;
  const env = serverEnv();
  if (env.EMAIL_API_KEY) cached = resendTransport(env.EMAIL_API_KEY);
  else if (env.SMTP_URL && env.APP_ENV === "local") cached = smtpTransport(env.SMTP_URL);
  else if (env.APP_ENV === "local" || env.NODE_ENV === "test") cached = disabledTransport;
  else throw new Error("EMAIL_API_KEY mangler: e-mails kan ikke sendes");
  return cached;
}

/** Kun til tests: opsamler e-mails i stedet for at sende dem. */
export function captureEmails(): Email[] {
  const outbox: Email[] = [];
  override = { name: "memory", send: async (email) => void outbox.push(email) };
  return outbox;
}

/** Kun til tests: en anden transport (fx en, der fejler), eller undefined for den normale. */
export function useEmailTransportForTests(transport: EmailTransport | undefined) {
  override = transport;
}

export async function sendEmail(email: Email): Promise<void> {
  const from = serverEnv().EMAIL_FROM ?? "Biludlejning <noreply@example.com>";
  const active = transport();
  try {
    await active.send(email, from);
  } catch (error) {
    logger.error({ err: error, transport: active.name, subject: email.subject }, "E-mail fejlede");
    throw error;
  }
}
