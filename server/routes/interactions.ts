import type { Express } from "express";
import { storage } from "../storage";
import { insertInteractionSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp } from "./shared";

export function registerInteractionRoutes(app: Express) {
  app.get("/api/interactions", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getInteractions(physicianId));
  });

  app.post("/api/interactions", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.occurredAt === "string") body.occurredAt = new Date(body.occurredAt);
      if (typeof body.followUpDueAt === "string") body.followUpDueAt = new Date(body.followUpDueAt);
      const validated = insertInteractionSchema.parse(body);
      const inter = await storage.createInteraction(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Interaction", entityId: inter.id, detailJson: { type: inter.type, physicianId: inter.physicianId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(inter);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
