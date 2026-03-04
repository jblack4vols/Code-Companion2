import type { Express } from "express";
import { requireAuth, requireRole, getClientIp } from "./shared";
import { storage } from "../storage";

export function registerTemplateRoutes(app: Express) {
  app.get("/api/interaction-templates", requireAuth, async (req, res) => {
    try {
      const templates = await storage.getInteractionTemplates();
      res.json(templates);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/interaction-templates", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { name, type, defaultSummary, defaultNextStep } = req.body;
      if (!name || !type || !defaultSummary) {
        return res.status(400).json({ message: "name, type, and defaultSummary are required" });
      }

      const created = await storage.createInteractionTemplate({
        name,
        type,
        defaultSummary,
        defaultNextStep: defaultNextStep || null,
        createdBy: req.session.userId!,
        isActive: true,
      });

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "CREATE",
        entity: "InteractionTemplate",
        entityId: created.id,
        detailJson: req.body,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.status(201).json(created);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/interaction-templates/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { name, type, defaultSummary, defaultNextStep, isActive } = req.body;
      const updated = await storage.updateInteractionTemplate(req.params.id, {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(defaultSummary !== undefined && { defaultSummary }),
        ...(defaultNextStep !== undefined && { defaultNextStep }),
        ...(isActive !== undefined && { isActive }),
      });

      if (!updated) return res.status(404).json({ message: "Template not found" });
      res.json(updated);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/interaction-templates/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      await storage.deleteInteractionTemplate(req.params.id);
      res.json({ message: "Template deactivated" });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
