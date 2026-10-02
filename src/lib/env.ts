import { z } from "zod";

/**
 * Server-side miljøvariabler, valideret ved opstart (se src/instrumentation.ts).
 * Variabler, der først bruges i senere milestones, er valgfrie indtil da.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "preview", "staging", "production"]).default("local"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  SENTRY_DSN: z.url().optional(),

  AUTH_SECRET: z.string().min(32).optional(),
  // Offentlig adresse, som links i e-mails og CSRF-tjek bygger på. Fx https://www.example.dk
  AUTH_URL: z.url().optional(),
  FIELD_ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Kun lokalt og i CI: simuleret betaling uden Stripe-nøgler. Ignoreres på staging og production.
  FAKE_PAYMENTS: z.enum(["true", "false"]).optional(),

  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Kun lokalt: send e-mails til Mailpit (docker compose) i stedet for e-mailudbyderen.
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),

  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  MAPS_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  // Tomme strenge fra .env-filer behandles som "ikke sat".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = serverSchema.safeParse(cleaned);
  if (!result.success) {
    // Kun navnene på felterne logges, aldrig værdierne.
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Ugyldige eller manglende miljøvariabler: ${fields}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
