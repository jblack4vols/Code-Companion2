import type { Express } from "express";
import { storage } from "../storage";
import { insertInteractionSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp } from "./shared";

export function registerInteractionRoutes(app: Express) {
  app.get("/api/interactions", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    const includeDeleted = req.query.includeDeleted === "true";
    res.json(await storage.getInteractions(physicianId, includeDeleted));
  });

  app.post("/api/interactions", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      const skipAutoTask = body.skipAutoTask;
      delete body.skipAutoTask;
      if (typeof body.occurredAt === "string") body.occurredAt = new Date(body.occurredAt);
      if (typeof body.followUpDueAt === "string") body.followUpDueAt = new Date(body.followUpDueAt);
      const validated = insertInteractionSchema.parse(body);
      const inter = await storage.createInteraction(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Interaction", entityId: inter.id, detailJson: { type: inter.type, physicianId: inter.physicianId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });

      if (inter.followUpDueAt && !skipAutoTask) {
        try {
          await storage.createTask({
            description: `Follow up on ${inter.type?.toLowerCase() || 'interaction'}: ${inter.summary || 'No details'}`,
            physicianId: inter.physicianId,
            assignedToUserId: req.session.userId!,
            dueAt: inter.followUpDueAt,
            status: "OPEN",
            priority: "MEDIUM",
          });
        } catch (taskErr: any) {
          console.error("[Interactions] Auto-task creation failed:", taskErr.message);
        }
      }

      res.json(inter);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/interactions/paginated", requireAuth, async (req, res) => {
    const filters = {
      search: req.query.search as string | undefined,
      type: req.query.type as string | undefined,
      locationId: req.query.locationId as string | undefined,
      physicianId: req.query.physicianId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      includeDeleted: req.query.includeDeleted === "true",
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 50,
    };
    res.json(await storage.getInteractionsPaginated(filters));
  });

  app.patch("/api/interactions/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.occurredAt === "string") body.occurredAt = new Date(body.occurredAt);
      if (typeof body.followUpDueAt === "string") body.followUpDueAt = new Date(body.followUpDueAt);
      const updated = await storage.updateInteraction(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Interaction", entityId: req.params.id, detailJson: body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/interactions/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const success = await storage.softDeleteInteraction(req.params.id);
      if (!success) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Interaction", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/interactions/:id/restore", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const success = await storage.restoreInteraction(req.params.id);
      if (!success) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "RESTORE", entity: "Interaction", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
