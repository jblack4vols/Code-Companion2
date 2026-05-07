/**
 * Sentry server-side init. Env-gated: a no-op if SENTRY_DSN isn't set,
 * so dev and self-hosted forks don't accidentally ship telemetry.
 *
 * Wire in app.ts BEFORE other middleware so request errors are captured.
 */
import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Strip request bodies — they may contain PHI on referral/interaction routes.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  });
  initialized = true;
  console.log("[sentry] initialized");
  return true;
}

export { Sentry };
