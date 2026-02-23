import type { Express } from "express";
import { db } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { goals, territories, locations, territoryMonthlySummary, locationMonthlySummary } from "@shared/schema";
import { requireAuth, requireRole, getClientIp } from "./shared";
import { storage } from "../storage";

export function registerGoalRoutes(app: Express) {
  app.get("/api/goals", requireAuth, async (req, res) => {
    try {
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";
      const scopeType = req.query.scopeType as string | undefined;

      let conditions = [eq(goals.month, month)];
      if (scopeType === "TERRITORY" || scopeType === "LOCATION") {
        conditions.push(eq(goals.scopeType, scopeType));
      }

      const result = await db.select().from(goals).where(and(...conditions));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/goals", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { month, scopeType, scopeId, targetReferrals, targetRevenue } = req.body;
      if (!month || !scopeType || !scopeId) {
        return res.status(400).json({ message: "month, scopeType, and scopeId are required" });
      }

      const existing = await db.select().from(goals).where(
        and(eq(goals.month, month), eq(goals.scopeType, scopeType), eq(goals.scopeId, scopeId))
      );

      if (existing.length > 0) {
        const [updated] = await db.update(goals).set({
          targetReferrals: targetReferrals || 0,
          targetRevenue: targetRevenue || null,
          updatedAt: new Date(),
        }).where(eq(goals.id, existing[0].id)).returning();
        return res.json(updated);
      }

      const [created] = await db.insert(goals).values({
        month,
        scopeType,
        scopeId,
        targetReferrals: targetReferrals || 0,
        targetRevenue: targetRevenue || null,
        createdBy: req.session.userId,
      }).returning();

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "CREATE",
        entity: "Goal",
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

  app.delete("/api/goals/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      await db.delete(goals).where(eq(goals.id, req.params.id));
      res.json({ message: "Goal deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/goals/progress", requireAuth, async (req, res) => {
    try {
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";

      const allGoals = await db.select().from(goals).where(eq(goals.month, month));

      const terrSummaries = await db.select().from(territoryMonthlySummary)
        .where(eq(territoryMonthlySummary.month, month));
      const locSummaries = await db.select().from(locationMonthlySummary)
        .where(eq(locationMonthlySummary.month, month));

      const allTerritories = await db.select().from(territories);
      const allLocations = await db.select().from(locations);
      const terrMap = new Map(allTerritories.map(t => [t.id, t.name]));
      const locMap = new Map(allLocations.map(l => [l.id, l.name]));

      const progress = allGoals.map(goal => {
        let actualReferrals = 0;
        let actualRevenue = 0;
        let scopeName = "";

        if (goal.scopeType === "TERRITORY") {
          const summary = terrSummaries.find(s => s.territoryId === goal.scopeId);
          actualReferrals = summary?.referralsCount || 0;
          actualRevenue = parseFloat(String(summary?.revenueTotal || 0));
          scopeName = terrMap.get(goal.scopeId) || "Unknown Territory";
        } else {
          const summary = locSummaries.find(s => s.locationId === goal.scopeId);
          actualReferrals = summary?.referralsCount || 0;
          actualRevenue = parseFloat(String(summary?.revenueTotal || 0));
          scopeName = locMap.get(goal.scopeId) || "Unknown Location";
        }

        const targetRefs = goal.targetReferrals || 1;
        const progressPct = Math.min(Math.round((actualReferrals / targetRefs) * 100), 100);

        return {
          ...goal,
          scopeName,
          actualReferrals,
          actualRevenue,
          progressPct,
        };
      });

      res.json(progress);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
