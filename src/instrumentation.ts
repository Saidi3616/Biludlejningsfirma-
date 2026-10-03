import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Stop opstart med en klar fejl, hvis påkrævede miljøvariabler mangler.
    const { serverEnv } = await import("@/lib/env");
    const env = serverEnv();

    if (env.SENTRY_DSN) {
      Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.APP_ENV,
        tracesSampleRate: env.APP_ENV === "production" ? 0.1 : 1.0,
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge" && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.APP_ENV,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
