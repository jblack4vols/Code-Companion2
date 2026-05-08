import type { Express } from "express";
import { storage } from "../storage";
import { insertCalendarEventSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp, qstr } from "./shared";
import {
  pushEventToOutlook,
  updateEventInOutlook,
  deleteEventFromOutlook,
} from "../outlook-event-sync";

export function registerCalendarRoutes(app: Express) {
  app.get("/api/calendar-events", requireAuth, async (req, res) => {
    // Support ?userIds=id1,id2,id3 or ?userId=id for organizer filtering
    const rawUserIds = qstr(req.query.userIds) ?? qstr(req.query.userId);
    const userIds = rawUserIds
      ? rawUserIds.split(",").map(s => s.trim()).filter(Boolean)
      : undefined;

    const filters = {
      startDate: qstr(req.query.startDate),
      endDate: qstr(req.query.endDate),
      locationId: qstr(req.query.locationId),
      physicianId: qstr(req.query.physicianId),
      practiceName: qstr(req.query.practiceName),
      userIds,
    };
    res.json(await storage.getCalendarEvents(filters));
  });

  app.get("/api/calendar-events/:id", requireAuth, async (req, res) => {
    const event = await storage.getCalendarEvent(String(req.params.id));
    if (!event) return res.status(404).json({ message: "Not found" });
    res.json(event);
  });

  app.post("/api/calendar-events", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.startAt === "string") body.startAt = new Date(body.startAt);
      if (typeof body.endAt === "string") body.endAt = new Date(body.endAt);
      const validated = insertCalendarEventSchema.parse(body);
      const event = await storage.createCalendarEvent(validated);

      // Best-effort push to Outlook for the organizer. Failures are logged
      // but don't break event creation — the local event is the source of truth.
      const organizerId = event.organizerUserId ?? req.session.userId!;
      const outlookEventId = await pushEventToOutlook(organizerId, event);
      const persistedEvent = outlookEventId
        ? (await storage.updateCalendarEvent(event.id, { outlookEventId })) ?? event
        : event;

      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "CalendarEvent", entityId: event.id, detailJson: { title: event.title, outlookSynced: !!outlookEventId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(persistedEvent);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/calendar-events/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const existing = await storage.getCalendarEvent(String(req.params.id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      const user = await storage.getUser(req.session.userId!);
      if (user && user.role !== "OWNER" && user.role !== "DIRECTOR" && existing.organizerUserId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden: you can only edit events you organized" });
      }
      const body = { ...req.body };
      if (typeof body.startAt === "string") body.startAt = new Date(body.startAt);
      if (typeof body.endAt === "string") body.endAt = new Date(body.endAt);
      const validated = insertCalendarEventSchema.partial().parse(body);
      const event = await storage.updateCalendarEvent(String(req.params.id), validated);
      if (!event) return res.status(404).json({ message: "Not found" });

      // Best-effort mirror to Outlook. If we have a Graph id, PATCH it; if
      // we don't (e.g. event was created before auto-sync existed, or a
      // previous push failed), POST and back-fill the id.
      const organizerId = event.organizerUserId ?? req.session.userId!;
      let persistedEvent = event;
      if (event.outlookEventId) {
        await updateEventInOutlook(organizerId, event.outlookEventId, event);
      } else {
        const newOutlookId = await pushEventToOutlook(organizerId, event);
        if (newOutlookId) {
          persistedEvent = (await storage.updateCalendarEvent(event.id, { outlookEventId: newOutlookId })) ?? event;
        }
      }

      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "CalendarEvent", entityId: event.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(persistedEvent);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/calendar-events/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const existing = await storage.getCalendarEvent(String(req.params.id));
      if (!existing) return res.status(404).json({ message: "Not found" });
      const user = await storage.getUser(req.session.userId!);
      if (user && user.role !== "OWNER" && user.role !== "DIRECTOR" && existing.organizerUserId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden: you can only delete events you organized" });
      }

      // Best-effort cleanup in Outlook before removing locally.
      if (existing.outlookEventId) {
        const organizerId = existing.organizerUserId ?? req.session.userId!;
        await deleteEventFromOutlook(organizerId, existing.outlookEventId);
      }

      await storage.deleteCalendarEvent(String(req.params.id));
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "CalendarEvent", entityId: String(req.params.id), detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
