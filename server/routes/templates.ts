import type { Express } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { interactionTemplates } from "@shared/schema";
import { requireAuth, requireRole, getClientIp } from "./shared";
import { storage } from "../storage";

export function registerTemplateRoutes(app: Express) {
  app.get("/api/interaction-templates", requireAuth, async (req, res) => {
    try {
      const all = await db.select().from(interactionTemplates).where(eq(interactionTemplates.isActive, true));
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/interaction-templates", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { name, type, defaultSummary, defaultNextStep } = req.body;
      if (!name || !type || !defaultSummary) {
        return res.status(400).json({ message: "name, type, and defaultSummary are required" });
      }

      const [created] = await db.insert(interactionTemplates).values({
        name,
        type,
        defaultSummary,
        defaultNextStep: defaultNextStep || null,
        createdBy: req.session.userId,
      }).returning();

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
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/interaction-templates/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { name, type, defaultSummary, defaultNextStep, isActive } = req.body;
      const [updated] = await db.update(interactionTemplates).set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(defaultSummary !== undefined && { defaultSummary }),
        ...(defaultNextStep !== undefined && { defaultNextStep }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      }).where(eq(interactionTemplates.id, req.params.id)).returning();

      if (!updated) return res.status(404).json({ message: "Template not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/interaction-templates/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      await db.update(interactionTemplates).set({ isActive: false, updatedAt: new Date() })
        .where(eq(interactionTemplates.id, req.params.id));
      res.json({ message: "Template deactivated" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
