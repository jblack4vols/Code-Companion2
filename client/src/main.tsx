import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Env-gated Sentry init. No DSN → no-op (dev + self-hosted forks ship clean).
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Strip cookies, request body, IP — they may carry PHI on referral
    // and interaction routes.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
      }
      if (event.user) delete event.user.ip_address;
      return event;
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
