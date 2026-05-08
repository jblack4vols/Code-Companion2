/**
 * Outlook / Microsoft calendar integration route handlers.
 * Registered by integrations.ts barrel.
 *
 * Manual sync-event endpoint: pushes a single CalendarEvent to the
 * requesting user's Outlook. Auto-sync on event create/update/delete
 * happens in calendar.ts via outlook-event-sync helpers — this manual
 * endpoint is now mostly a fallback / re-sync trigger.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, getClientIp } from "./shared";
import { pushEventToOutlook, updateEventInOutlook } from "../outlook-event-sync";

export function registerOutlookRoutes(app: Express) {
  app.post("/api/integrations/outlook/sync-event", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const { eventId } = req.body;
      if (!eventId) return res.status(400).json({ message: "eventId required" });

      const event = await storage.getCalendarEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const userId = req.session.userId!;
      const outlookEventId = event.outlookEventId
        ? (await updateEventInOutlook(userId, event.outlookEventId, event)) ? event.outlookEventId : null
        : await pushEventToOutlook(userId, event);

      if (!outlookEventId) {
        return res.status(400).json({ message: "Outlook sync failed. Please reconnect your Microsoft account on the Calendar page." });
      }

      if (outlookEventId !== event.outlookEventId) {
        await storage.updateCalendarEvent(eventId, { outlookEventId });
      }

      await storage.createAuditLog({
        userId,
        action: "SYNC_OUTLOOK",
        entity: "CalendarEvent",
        entityId: eventId,
        detailJson: { outlookId: outlookEventId },
        ipAddress: getClientIp(req),
        userAgent: (req.headers["user-agent"] as string) || null,
      });
      res.json({ success: true, outlookEventId });
    } catch (err: any) {
      console.error("[Outlook sync-event]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
