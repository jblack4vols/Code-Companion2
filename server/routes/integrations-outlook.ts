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
import { pushEventToOutlook, updateEventInOutlook, deleteEventFromOutlook } from "../outlook-event-sync";

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

      // Clear the sync-disabled flag — user explicitly asked to (re)sync,
      // so future auto-syncs should resume.
      await storage.updateCalendarEvent(eventId, {
        outlookEventId,
        outlookSyncDisabled: false,
      });

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

  /**
   * Remove a CalendarEvent from Outlook + opt the local event out of
   * future auto-syncs. Idempotent: if outlookEventId is already null
   * we just flip the flag.
   */
  app.post("/api/integrations/outlook/unsync-event", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const { eventId } = req.body;
      if (!eventId) return res.status(400).json({ message: "eventId required" });

      const event = await storage.getCalendarEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const userId = req.session.userId!;

      if (event.outlookEventId) {
        // Best-effort: a Graph 404 just means it's already gone in Outlook.
        await deleteEventFromOutlook(userId, event.outlookEventId);
      }

      const updated = await storage.updateCalendarEvent(eventId, {
        outlookEventId: null,
        outlookSyncDisabled: true,
      });

      await storage.createAuditLog({
        userId,
        action: "UNSYNC_OUTLOOK",
        entity: "CalendarEvent",
        entityId: eventId,
        detailJson: { previousOutlookId: event.outlookEventId },
        ipAddress: getClientIp(req),
        userAgent: (req.headers["user-agent"] as string) || null,
      });
      res.json({ success: true, event: updated });
    } catch (err: any) {
      console.error("[Outlook unsync-event]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
