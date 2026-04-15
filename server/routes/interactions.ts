import type { Express } from "express";
import { storage } from "../storage";
import { insertInteractionSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp, getUserLocationScope, qstr, qstrReq } from "./shared";

export function registerInteractionRoutes(app: Express) {
  app.get("/api/interactions", requireAuth, async (req, res) => {
    const physicianId = qstr(req.query.physicianId);
    const includeDeleted = req.query.includeDeleted === "true";
    const locationScope = await getUserLocationScope(req);
    if (locationScope !== null && locationScope.length === 0) return res.json([]);
    const results = await storage.getInteractions(physicianId, includeDeleted);
    if (locationScope === null) return res.json(results);
    const scopeSet = new Set(locationScope);
    res.json(results.filter((i: any) => i.locationId && scopeSet.has(i.locationId)));
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
    const locationScope = await getUserLocationScope(req);
    if (locationScope !== null && locationScope.length === 0) {
      return res.json({ data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
    }
    const filters = {
      search: qstr(req.query.search),
      type: qstr(req.query.type),
      locationId: qstr(req.query.locationId),
      locationIds: locationScope ?? undefined,
      physicianId: qstr(req.query.physicianId),
      dateFrom: qstr(req.query.dateFrom),
      dateTo: qstr(req.query.dateTo),
      includeDeleted: req.query.includeDeleted === "true",
      page: req.query.page ? Number(qstrReq(req.query.page)) : 1,
      pageSize: req.query.pageSize ? Number(qstrReq(req.query.pageSize)) : 50,
    };
    res.json(await storage.getInteractionsPaginated(filters));
  });

  app.patch("/api/interactions/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const interaction = await storage.getInteraction(String(req.params.id));
      if (!interaction) return res.status(404).json({ message: "Not found" });
      const user = await storage.getUser(req.session.userId!);
      if (user && user.role !== "OWNER" && user.role !== "DIRECTOR" && interaction.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden: you can only edit your own interactions" });
      }
      const body = { ...req.body };
      if (typeof body.occurredAt === "string") body.occurredAt = new Date(body.occurredAt);
      if (typeof body.followUpDueAt === "string") body.followUpDueAt = new Date(body.followUpDueAt);
      const updated = await storage.updateInteraction(String(req.params.id), body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Interaction", entityId: String(req.params.id), detailJson: body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/interactions/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const interaction = await storage.getInteraction(String(req.params.id));
      if (!interaction) return res.status(404).json({ message: "Not found" });
      const user = await storage.getUser(req.session.userId!);
      if (user && user.role !== "OWNER" && user.role !== "DIRECTOR" && interaction.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden: you can only delete your own interactions" });
      }
      const success = await storage.softDeleteInteraction(String(req.params.id));
      if (!success) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Interaction", entityId: String(req.params.id), detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/interactions/:id/restore", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const interaction = await storage.getInteraction(String(req.params.id));
      if (!interaction) return res.status(404).json({ message: "Not found" });
      const user = await storage.getUser(req.session.userId!);
      if (user && user.role !== "OWNER" && user.role !== "DIRECTOR" && interaction.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden: you can only restore your own interactions" });
      }
      const success = await storage.restoreInteraction(String(req.params.id));
      if (!success) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "RESTORE", entity: "Interaction", entityId: String(req.params.id), detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
