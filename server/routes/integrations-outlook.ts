/**
 * Outlook / Microsoft calendar integration route handlers.
 * Registered by integrations.ts barrel.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, getClientIp } from "./shared";

export async function getOutlookAccessToken(): Promise<string | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
    if (!hostname || !xReplitToken) return null;
    const response = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=outlook",
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
    );
    const data = await response.json();
    const settings = data?.items?.[0]?.settings;
    return settings?.access_token || settings?.oauth?.credentials?.access_token || null;
  } catch {
    return null;
  }
}

export function registerOutlookRoutes(app: Express) {
  app.post("/api/integrations/outlook/sync-event", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const { eventId } = req.body;
      if (!eventId) return res.status(400).json({ message: "eventId required" });

      const event = await storage.getCalendarEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const accessToken = await getOutlookAccessToken();
      if (!accessToken) return res.status(400).json({ message: "Outlook not connected. Please connect your Microsoft account in Settings." });

      const outlookEvent = {
        subject: event.title,
        body: { contentType: "Text", content: event.description || "" },
        start: { dateTime: event.startAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: event.endAt.toISOString(), timeZone: "UTC" },
        isAllDay: event.allDay,
      };

      let result;
      if (event.outlookEventId) {
        result = await fetch(`https://graph.microsoft.com/v1.0/me/events/${event.outlookEventId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(outlookEvent),
        });
      } else {
        result = await fetch("https://graph.microsoft.com/v1.0/me/events", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(outlookEvent),
        });
      }

      if (!result.ok) {
        const errText = await result.text();
        return res.status(result.status).json({ message: `Outlook sync failed: ${errText}` });
      }

      const data = await result.json();
      await storage.updateCalendarEvent(eventId, { outlookEventId: data.id });
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "SYNC_OUTLOOK",
        entity: "CalendarEvent",
        entityId: eventId,
        detailJson: { outlookId: data.id },
        ipAddress: getClientIp(req),
        userAgent: (req.headers["user-agent"] as string) || null,
      });
      res.json({ success: true, outlookEventId: data.id });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
