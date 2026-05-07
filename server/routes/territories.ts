import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertCollectionSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp, getUserLocationScope, qstr } from "./shared";

export function registerTerritoryRoutes(app: Express) {
  app.get("/api/territories", requireAuth, async (req, res) => {
    res.json(await storage.getTerritories());
  });

  app.get("/api/territories/:id", requireAuth, async (req, res) => {
    const t = await storage.getTerritory(String(req.params.id));
    if (!t) return res.status(404).json({ message: "Not found" });
    res.json(t);
  });

  const territorySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  });

  app.post("/api/territories", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const parsed = territorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
      }
      const territory = await storage.createTerritory(parsed.data);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Territory", entityId: territory.id, detailJson: parsed.data, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(territory);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  const territoryPatchSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  });

  app.patch("/api/territories/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const parsed = territoryPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
      }
      const territory = await storage.updateTerritory(String(req.params.id), parsed.data);
      if (!territory) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Territory", entityId: String(req.params.id), detailJson: parsed.data, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(territory);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/territories/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      await storage.deleteTerritory(String(req.params.id));
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Territory", entityId: String(req.params.id), detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/collections", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    const locationScope = await getUserLocationScope(req);
    // Non-admin with no location assignments — return empty results
    if (locationScope !== null && locationScope.length === 0) {
      return res.json([]);
    }
    const filters = {
      physicianId: qstr(req.query.physicianId),
      locationId: qstr(req.query.locationId),
      locationIds: locationScope ?? undefined,
      dateFrom: qstr(req.query.dateFrom),
      dateTo: qstr(req.query.dateTo),
    };
    res.json(await storage.getCollections(filters));
  });

  app.post("/api/collections", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const parsed = insertCollectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
      }
      const col = await storage.createCollection(parsed.data);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Collection", entityId: col.id, detailJson: parsed.data, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(col);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
