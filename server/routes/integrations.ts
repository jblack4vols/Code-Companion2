/**
 * Integration routes barrel — registers all sub-route modules.
 * Sub-modules:
 *   integrations-outlook.ts     — Outlook calendar sync
 *   integrations-sharepoint.ts  — SharePoint sync
 *   integrations-custom-api.ts  — GoHighLevel + Custom API CRUD/test/sync
 */
import type { Express } from "express";
import { requireAuth } from "./shared";
import { registerOutlookRoutes, getOutlookAccessToken } from "./integrations-outlook";
import { registerSharePointRoutes } from "./integrations-sharepoint";
import { registerCustomApiRoutes } from "./integrations-custom-api";

export function registerIntegrationRoutes(app: Express) {
  // ---- Connection status check ----
  app.get("/api/integrations/status", requireAuth, async (req, res) => {
    let outlookConnected = false;
    let sharepointConnected = false;

    try {
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const xReplitToken = process.env.REPL_IDENTITY
        ? "repl " + process.env.REPL_IDENTITY
        : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

      if (hostname && xReplitToken) {
        try {
          const outlookRes = await fetch(
            "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=outlook",
            { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
          );
          if (outlookRes.ok) {
            const outlookData = await outlookRes.json();
            outlookConnected = !!(
              outlookData?.items?.[0]?.settings?.access_token ||
              outlookData?.items?.[0]?.settings?.oauth?.credentials?.access_token
            );
          }
        } catch { /* outlook check failed */ }

        try {
          const spRes = await fetch(
            "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=sharepoint",
            { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
          );
          if (spRes.ok) {
            const spData = await spRes.json();
            sharepointConnected = !!(
              spData?.items?.[0]?.settings?.access_token ||
              spData?.items?.[0]?.settings?.oauth?.credentials?.access_token
            );
          }
        } catch { /* sharepoint check failed */ }
      }
    } catch { /* silently fail */ }

    res.json({ outlook: outlookConnected, sharepoint: sharepointConnected });
  });

  registerOutlookRoutes(app);
  registerSharePointRoutes(app);
  registerCustomApiRoutes(app);
}
