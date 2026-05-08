import type { Express } from "express";
import { storage } from "../storage";
import { insertLocationSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp } from "./shared";
import { syncItemCreate, syncItemUpdate, syncItemDelete } from "../sharepoint-item-sync";

export function registerLocationRoutes(app: Express) {
  app.get("/api/locations", requireAuth, async (req, res) => {
    res.json(await storage.getLocations());
  });

  app.get("/api/locations/:id", requireAuth, async (req, res) => {
    const loc = await storage.getLocation(String(req.params.id));
    if (!loc) return res.status(404).json({ message: "Not found" });
    res.json(loc);
  });

  app.post("/api/locations", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const validated = insertLocationSchema.parse(req.body);
      const loc = await storage.createLocation(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Location", entityId: loc.id, detailJson: { name: loc.name }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      await syncItemCreate("locations", loc.id);
      res.json(loc);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/locations/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const validated = insertLocationSchema.partial().parse(req.body);
      const loc = await storage.updateLocation(String(req.params.id), validated);
      if (!loc) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Location", entityId: loc.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      await syncItemUpdate("locations", loc.id);
      res.json(loc);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/locations/:id", requireRole("OWNER"), async (req, res) => {
    try {
      await storage.deleteLocation(String(req.params.id));
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Location", entityId: String(req.params.id), detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      await syncItemDelete("locations", String(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(409).json({ message: err.message });
    }
  });
}
