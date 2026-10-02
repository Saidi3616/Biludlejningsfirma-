import pino from "pino";

/**
 * Felter der aldrig må ende i logs (§48). Stierne matcher både på topniveau
 * og ét niveau nede, fx `{ customer: { email } }`.
 */
export const REDACTED_KEYS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "secret",
  "cardNumber",
  "cvc",
  "licenseNumber",
  "dateOfBirth",
  "email",
  "phone",
];

const redactPaths = REDACTED_KEYS.flatMap((key) => [key, `*.${key}`]);

export function createLogger(options: { level?: string; pretty?: boolean } = {}) {
  return pino({
    level: options.level ?? process.env.LOG_LEVEL ?? "info",
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    base: { app: "biludlejning", env: process.env.APP_ENV ?? "local" },
    ...(options.pretty ? { transport: { target: "pino-pretty" } } : {}),
  });
}

export const logger = createLogger();
