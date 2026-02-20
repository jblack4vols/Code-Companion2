import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, getClientIp } from "./shared";

export function registerTerritoryRoutes(app: Express) {
  app.get("/api/territories", requireAuth, async (req, res) => {
    res.json(await storage.getTerritories());
  });

  app.get("/api/territories/:id", requireAuth, async (req, res) => {
    const t = await storage.getTerritory(req.params.id);
    if (!t) return res.status(404).json({ message: "Not found" });
    res.json(t);
  });

  app.post("/api/territories", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const territory = await storage.createTerritory(req.body);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Territory", entityId: territory.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(territory);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/territories/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const territory = await storage.updateTerritory(req.params.id, req.body);
      if (!territory) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Territory", entityId: req.params.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(territory);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/territories/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      await storage.deleteTerritory(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Territory", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/collections", requireAuth, async (req, res) => {
    const filters = {
      physicianId: req.query.physicianId as string | undefined,
      locationId: req.query.locationId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    };
    res.json(await storage.getCollections(filters));
  });

  app.post("/api/collections", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const col = await storage.createCollection(req.body);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Collection", entityId: col.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(col);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
