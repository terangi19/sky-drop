import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("../sentry.server.config");
    } catch (error) {
      console.warn("[Instrumentation] Sentry server config not found, skipping Sentry initialization");
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    try {
      await import("../sentry.client.config");
    } catch (error) {
      console.warn("[Instrumentation] Sentry client config not found, skipping Sentry initialization");
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
