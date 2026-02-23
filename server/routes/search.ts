import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, getClientIp, qstr } from "./shared";

export function registerSearchRoutes(app: Express) {
  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const q = qstr(req.query.q as string);
      if (!q || q.length < 2) return res.json({ physicians: [], referrals: [] });
      const results = await storage.globalSearch(q, 10);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const favoriteIds = await storage.getPhysicianFavorites(req.session.userId!);
      res.json(favoriteIds);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/favorites/:physicianId", requireAuth, async (req, res) => {
    try {
      await storage.addPhysicianFavorite(req.session.userId!, req.params.physicianId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/favorites/:physicianId", requireAuth, async (req, res) => {
    try {
      await storage.removePhysicianFavorite(req.session.userId!, req.params.physicianId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/unlinked", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const page = parseInt(qstr(req.query.page as string) || "1");
      const pageSize = parseInt(qstr(req.query.pageSize as string) || "50");
      const result = await storage.getUnlinkedReferrals(page, pageSize);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/referrals/:id/link", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { physicianId } = req.body;
      if (!physicianId) return res.status(400).json({ message: "physicianId is required" });
      const updated = await storage.linkReferralToPhysician(req.params.id, physicianId);
      if (!updated) return res.status(404).json({ message: "Referral or physician not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "LINK_REFERRAL", entity: "Referral", entityId: req.params.id, detailJson: { physicianId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/referrals/:id/self-referral", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const updated = await storage.categorizeReferralAsSelfReferral(req.params.id);
      if (!updated) return res.status(404).json({ message: "Referral not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/:id/suggested-matches", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const matches = await storage.getSuggestedPhysicianMatches(req.params.id);
      res.json(matches);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/physicians/:id/health-score", requireAuth, async (req, res) => {
    try {
      const physId = req.params.id;
      const summaries = await storage.getPhysicianMonthlySummaries({ physicianId: physId, months: 6 });
      const interactionsAll = await storage.getInteractions(physId);
      const activeInteractions = interactionsAll.filter(i => !i.deletedAt);

      const now = new Date();
      const lastInteraction = activeInteractions.length > 0 ? new Date(Math.max(...activeInteractions.map(i => new Date(i.occurredAt).getTime()))) : null;
      const daysSinceLastInteraction = lastInteraction ? Math.floor((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)) : 999;

      const recencyScore = daysSinceLastInteraction <= 14 ? 1.0 :
                           daysSinceLastInteraction <= 30 ? 0.8 :
                           daysSinceLastInteraction <= 60 ? 0.6 :
                           daysSinceLastInteraction <= 90 ? 0.3 : 0.1;

      const sortedSummaries = summaries.sort((a, b) => a.month.localeCompare(b.month));
      let trendScore = 0.5;
      if (sortedSummaries.length >= 2) {
        const recent = sortedSummaries.slice(-3);
        const older = sortedSummaries.slice(0, Math.max(1, sortedSummaries.length - 3));
        const recentAvg = recent.reduce((s, r) => s + r.referralsCount, 0) / recent.length;
        const olderAvg = older.reduce((s, r) => s + r.referralsCount, 0) / older.length;
        if (olderAvg > 0) {
          const change = (recentAvg - olderAvg) / olderAvg;
          trendScore = Math.max(0, Math.min(1, 0.5 + change));
        }
      }

      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const recentInteractions = activeInteractions.filter(i => new Date(i.occurredAt) >= threeMonthsAgo);
      const frequencyScore = recentInteractions.length >= 6 ? 1.0 :
                             recentInteractions.length >= 3 ? 0.7 :
                             recentInteractions.length >= 1 ? 0.4 : 0.1;

      const totalReferrals = sortedSummaries.reduce((s, r) => s + r.referralsCount, 0);
      const volumeScore = totalReferrals >= 20 ? 1.0 :
                          totalReferrals >= 10 ? 0.7 :
                          totalReferrals >= 5 ? 0.5 :
                          totalReferrals >= 1 ? 0.3 : 0.1;

      const healthScore = Math.round((recencyScore * 0.3 + trendScore * 0.25 + frequencyScore * 0.25 + volumeScore * 0.2) * 100);
      const healthLabel = healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : healthScore >= 40 ? "Fair" : "At Risk";

      res.json({
        healthScore,
        healthLabel,
        components: {
          recency: { score: Math.round(recencyScore * 100), daysSinceLastInteraction, lastInteractionDate: lastInteraction?.toISOString() || null },
          trend: { score: Math.round(trendScore * 100) },
          frequency: { score: Math.round(frequencyScore * 100), recentInteractionCount: recentInteractions.length },
          volume: { score: Math.round(volumeScore * 100), totalReferrals },
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
