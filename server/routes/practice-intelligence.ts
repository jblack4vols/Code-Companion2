import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "./shared";

// Practice Intelligence routes — read-only, requires authentication
export function registerPracticeRoutes(app: Express) {
  // GET /api/practices — paginated list of all practices with aggregated metrics
  app.get("/api/practices", requireAuth, async (req, res) => {
    try {
      const filters = {
        search: (req.query.search as string) || undefined,
        sortBy: (req.query.sortBy as string) || "totalReferrals",
        sortOrder: (req.query.sortOrder as string) || "desc",
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50,
      };
      const result = await storage.getPractices(filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/practices/:name/detail — single practice with all physicians and individual metrics
  app.get("/api/practices/:name/detail", requireAuth, async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name as string).trim();
      if (!name) return res.status(400).json({ message: "Practice name required" });
      const detail = await storage.getPracticeDetail(name);
      if (!detail) return res.status(404).json({ message: "Practice not found" });
      res.json(detail);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
