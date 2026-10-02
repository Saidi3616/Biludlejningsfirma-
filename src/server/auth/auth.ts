import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { site } from "@/config/site";
import { localizedPath } from "@/i18n/paths";
import { serverEnv } from "@/lib/env";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { authEmail, emailLocale } from "@/server/email/auth-emails";
import { sendEmail } from "@/server/email/send";

/** Kun til lokal udvikling og tests. Uden for `local` kræves AUTH_SECRET (se authSecret()). */
const DEV_SECRET = "local-development-secret-not-for-production-use-0000";

function authSecret() {
  const env = serverEnv();
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (env.APP_ENV === "local") return DEV_SECRET;
  throw new Error("AUTH_SECRET mangler");
}

export function authBaseUrl() {
  return serverEnv().AUTH_URL ?? "http://localhost:3000";
}

function createAuth() {
  const baseURL = authBaseUrl();

  return betterAuth({
    appName: site.name,
    baseURL,
    secret: authSecret(),
    database: prismaAdapter(db, { provider: "postgresql" }),
    telemetry: { enabled: false },

    advanced: {
      // Databasen giver id'er (uuid v7 via Prisma).
      database: { generateId: "uuid" },
      cookiePrefix: "bu",
      // Vercel sætter x-forwarded-for; bruges til rate limiting.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },

    user: {
      additionalFields: {
        // Rollen kan aldrig sættes af brugeren selv (input: false).
        role: { type: "string", input: false, required: false, defaultValue: "CUSTOMER" },
        locale: { type: "string", input: true, required: false, defaultValue: "da" },
        disabledAt: { type: "date", input: false, required: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Ingen cookie-cache: deaktivering og rolleskift virker straks.
      cookieCache: { enabled: false },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }) {
        const locale = emailLocale((user as { locale?: unknown }).locale);
        const url = `${baseURL}${localizedPath(locale, `/reset-password/${token}`)}`;
        await sendEmail(authEmail("reset", { to: user.email, name: user.name, url, locale }));
      },
      // Tilmelding med en e-mail, der allerede findes, giver samme svar som en ny tilmelding
      // (ingen afsløring af, hvem der har en konto). Ejeren får i stedet en besked.
      async onExistingUserSignUp({ user }) {
        const locale = emailLocale((user as { locale?: unknown }).locale);
        const url = `${baseURL}${localizedPath(locale, "/login")}`;
        await sendEmail(authEmail("existing", { to: user.email, name: user.name, url, locale }));
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      async sendVerificationEmail({ user, url }) {
        const locale = emailLocale((user as { locale?: unknown }).locale);
        await sendEmail(authEmail("verify", { to: user.email, name: user.name, url, locale }));
      },
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60 * 5, max: 3 },
        "/send-verification-email": { window: 60 * 5, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
      },
    },

    databaseHooks: {
      user: {
        create: {
          async before(user) {
            // Forsvar i dybden: nye brugere er altid kunder; medarbejdere oprettes af SUPER_ADMIN.
            const locale = emailLocale((user as { locale?: unknown }).locale);
            return { data: { ...user, role: "CUSTOMER", locale } };
          },
        },
      },
      session: {
        create: {
          async before(session) {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { disabledAt: true },
            });
            if (!user || user.disabledAt) {
              throw APIError.from("FORBIDDEN", {
                code: "ACCOUNT_DISABLED",
                message: "Account disabled",
              });
            }
          },
          async after(session) {
            await db.user
              .update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } })
              .catch((error) => logger.error({ err: error }, "Kunne ikke opdatere lastLoginAt"));
          },
        },
      },
    },

    plugins: [
      twoFactor({
        issuer: site.name,
        backupCodeOptions: { amount: 10, length: 10 },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Oprettes ved første brug, så `next build` ikke kræver hemmeligheder. */
export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
