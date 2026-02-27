import type { Express } from "express";
import { db } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import {
  physicians, interactions, referrals, tasks, physicianMonthlySummary,
  physicianStageHistory, users,
  territoryMonthlySummary,
} from "@shared/schema";
import { requireAuth, requireRole, qstr } from "./shared";
import { storage } from "../storage";

export function registerFeatureRoutes(app: Express) {
  app.get("/api/at-risk-sources", requireRole("OWNER", "DIRECTOR", "MARKETER", "ANALYST"), async (req, res) => {
    try {
      const filters: { locationId?: string; territoryId?: string } = {};
      const locationId = qstr(req.query.locationId as string);
      const territoryId = qstr(req.query.territoryId as string);
      if (locationId) filters.locationId = locationId;
      if (territoryId) filters.territoryId = territoryId;
      const result = await storage.getAtRiskReferralSources(filters);
      res.json(result);
    } catch (err: any) {
      console.error("at-risk-sources error:", err);
      res.status(500).json({ message: "Failed to retrieve at-risk sources" });
    }
  });
  app.get("/api/physicians/:id/scorecard", requireAuth, async (req, res) => {
    try {
      const physId = req.params.id;

      const [physician] = await db.select().from(physicians).where(eq(physicians.id, physId));
      if (!physician) return res.status(404).json({ message: "Physician not found" });

      const physInteractions = await db.select({
        id: interactions.id,
        type: interactions.type,
        summary: interactions.summary,
        occurredAt: interactions.occurredAt,
        userId: interactions.userId,
        nextStep: interactions.nextStep,
      }).from(interactions)
        .where(and(eq(interactions.physicianId, physId), sql`${interactions.deletedAt} IS NULL`))
        .orderBy(desc(interactions.occurredAt))
        .limit(50);

      const physReferrals = await db.select({
        id: referrals.id,
        referralDate: referrals.referralDate,
        status: referrals.status,
        patientInitialsOrAnonId: referrals.patientInitialsOrAnonId,
        caseTitle: referrals.caseTitle,
        locationId: referrals.locationId,
        valueEstimate: referrals.valueEstimate,
        arrivedVisits: referrals.arrivedVisits,
        scheduledVisits: referrals.scheduledVisits,
      }).from(referrals)
        .where(and(eq(referrals.physicianId, physId), sql`${referrals.deletedAt} IS NULL`))
        .orderBy(desc(referrals.referralDate))
        .limit(100);

      const physTasks = await db.select({
        id: tasks.id,
        description: tasks.description,
        status: tasks.status,
        dueAt: tasks.dueAt,
        priority: tasks.priority,
      }).from(tasks)
        .where(eq(tasks.physicianId, physId))
        .orderBy(desc(tasks.dueAt))
        .limit(20);

      const stageHistory = await db.select({
        id: physicianStageHistory.id,
        previousStage: physicianStageHistory.previousStage,
        newStage: physicianStageHistory.newStage,
        changedAt: physicianStageHistory.changedAt,
        reason: physicianStageHistory.reason,
        changedBy: physicianStageHistory.changedBy,
      }).from(physicianStageHistory)
        .where(eq(physicianStageHistory.physicianId, physId))
        .orderBy(desc(physicianStageHistory.changedAt));

      const monthlySummaries = await db.select().from(physicianMonthlySummary)
        .where(eq(physicianMonthlySummary.physicianId, physId))
        .orderBy(desc(physicianMonthlySummary.month))
        .limit(12);

      const totalReferrals = physReferrals.length;
      const convertedReferrals = physReferrals.filter(r =>
        r.status === "EVAL_COMPLETED" || r.status === "DISCHARGED"
      ).length;
      const conversionRate = totalReferrals > 0 ? Math.round((convertedReferrals / totalReferrals) * 100) : 0;
      const totalRevenue = monthlySummaries.reduce((sum, s) => sum + parseFloat(String(s.revenueGenerated || 0)), 0);
      const totalVisits = physReferrals.reduce((sum, r) => sum + (r.arrivedVisits || 0), 0);
      const avgVisitsPerReferral = totalReferrals > 0 ? Math.round(totalVisits / totalReferrals * 10) / 10 : 0;

      const now = new Date();
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const recentRefs = physReferrals.filter(r => new Date(r.referralDate) >= ninetyDaysAgo).length;

      let healthScore = 0;
      if (recentRefs >= 5) healthScore += 30;
      else if (recentRefs >= 2) healthScore += 20;
      else if (recentRefs >= 1) healthScore += 10;
      if (conversionRate >= 70) healthScore += 25;
      else if (conversionRate >= 50) healthScore += 15;
      else if (conversionRate >= 30) healthScore += 10;
      if (physInteractions.length >= 3) healthScore += 25;
      else if (physInteractions.length >= 1) healthScore += 15;
      const latestTier = monthlySummaries[0]?.tierLabel;
      if (latestTier === "A") healthScore += 20;
      else if (latestTier === "B") healthScore += 15;
      else if (latestTier === "C") healthScore += 10;
      else healthScore += 5;

      const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
      const userMap = new Map(allUsers.map(u => [u.id, u.name]));

      res.json({
        physician,
        interactions: physInteractions.map(i => ({ ...i, userName: userMap.get(i.userId) || "Unknown" })),
        referrals: physReferrals,
        tasks: physTasks,
        stageHistory: stageHistory.map(h => ({ ...h, changedByName: h.changedBy ? userMap.get(h.changedBy) : "System" })),
        monthlySummaries,
        metrics: {
          totalReferrals,
          convertedReferrals,
          conversionRate,
          totalRevenue,
          totalVisits,
          avgVisitsPerReferral,
          recentReferrals90d: recentRefs,
          healthScore: Math.min(healthScore, 100),
          currentTier: latestTier || "D",
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/roi/providers", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const months = parseInt(req.query.months as string) || 6;

      const result = await db.execute(sql`
        WITH recent_months AS (
          SELECT DISTINCT month FROM physician_monthly_summary
          ORDER BY month DESC LIMIT ${months}
        ),
        provider_roi AS (
          SELECT 
            pms.physician_id,
            p.first_name, p.last_name, p.credentials, p.specialty,
            p.practice_name, p.status, p.relationship_stage,
            SUM(pms.referrals_count) as total_referrals,
            SUM(pms.total_visits_generated) as total_visits,
            SUM(COALESCE(pms.revenue_generated, 0)::numeric) as total_revenue,
            CASE WHEN SUM(pms.referrals_count) > 0 
              THEN ROUND(SUM(COALESCE(pms.revenue_generated, 0)::numeric) / SUM(pms.referrals_count), 2) 
              ELSE 0 END as revenue_per_referral,
            CASE WHEN SUM(pms.referrals_count) > 0
              THEN ROUND(SUM(pms.total_visits_generated)::numeric / SUM(pms.referrals_count), 1)
              ELSE 0 END as visits_per_referral,
            MAX(pms.tier_label) as best_tier,
            COUNT(DISTINCT pms.month) as months_active
          FROM physician_monthly_summary pms
          JOIN recent_months rm ON pms.month = rm.month
          JOIN physicians p ON pms.physician_id = p.id AND p.deleted_at IS NULL
          GROUP BY pms.physician_id, p.first_name, p.last_name, p.credentials, 
                   p.specialty, p.practice_name, p.status, p.relationship_stage
          HAVING SUM(pms.referrals_count) > 0
        )
        SELECT * FROM provider_roi ORDER BY total_revenue DESC LIMIT 50
      `);

      const totalRevenue = (result.rows as any[]).reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0);
      const totalReferrals = (result.rows as any[]).reduce((sum, r) => sum + parseInt(r.total_referrals || 0), 0);

      res.json({
        providers: result.rows,
        summary: {
          totalRevenue,
          totalReferrals,
          avgRevenuePerReferral: totalReferrals > 0 ? Math.round(totalRevenue / totalReferrals) : 0,
          providerCount: result.rows.length,
          months,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/leaderboard", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const dateFrom = (req.query.dateFrom as string) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const dateTo = (req.query.dateTo as string) || new Date().toISOString().slice(0, 10);

      const interactionStats = await db.execute(sql`
        SELECT 
          u.id, u.name, u.role,
          COUNT(i.id)::int as total_interactions,
          COUNT(CASE WHEN i.type = 'VISIT' THEN 1 END)::int as visits,
          COUNT(CASE WHEN i.type = 'CALL' THEN 1 END)::int as calls,
          COUNT(CASE WHEN i.type = 'EMAIL' THEN 1 END)::int as emails,
          COUNT(CASE WHEN i.type = 'LUNCH' THEN 1 END)::int as lunches,
          COUNT(DISTINCT i.physician_id)::int as unique_providers_touched
        FROM users u
        LEFT JOIN interactions i ON u.id = i.user_id 
          AND i.deleted_at IS NULL
          AND i.occurred_at >= ${dateFrom}::date 
          AND i.occurred_at <= ${dateTo}::date
        WHERE u.role IN ('MARKETER', 'DIRECTOR', 'OWNER')
        GROUP BY u.id, u.name, u.role
        ORDER BY total_interactions DESC
      `);

      const referralStats = await db.execute(sql`
        SELECT 
          p.assigned_owner_id as user_id,
          COUNT(r.id)::int as referrals_generated,
          COUNT(CASE WHEN r.status IN ('EVAL_COMPLETED', 'DISCHARGED') THEN 1 END)::int as referrals_converted,
          SUM(COALESCE(r.arrived_visits, 0))::int as total_visits
        FROM referrals r
        JOIN physicians p ON r.physician_id = p.id
        WHERE r.deleted_at IS NULL
          AND p.assigned_owner_id IS NOT NULL
          AND r.referral_date >= ${dateFrom}
          AND r.referral_date <= ${dateTo}
        GROUP BY p.assigned_owner_id
      `);

      const taskStats = await db.execute(sql`
        SELECT 
          t.assigned_to_user_id as user_id,
          COUNT(CASE WHEN t.status = 'DONE' THEN 1 END)::int as tasks_completed,
          COUNT(CASE WHEN t.status = 'OPEN' THEN 1 END)::int as tasks_open
        FROM tasks t
        WHERE t.created_at >= ${dateFrom}::date AND t.created_at <= ${dateTo}::date
        GROUP BY t.assigned_to_user_id
      `);

      const refMap = new Map((referralStats.rows as any[]).map(r => [r.user_id, r]));
      const taskMap = new Map((taskStats.rows as any[]).map(r => [r.user_id, r]));

      const leaderboard = (interactionStats.rows as any[]).map(u => {
        const refs = refMap.get(u.id) || {};
        const tsks = taskMap.get(u.id) || {};
        const totalInteractions = u.total_interactions || 0;
        const referralsGenerated = refs.referrals_generated || 0;
        const referralsConverted = refs.referrals_converted || 0;
        const tasksCompleted = tsks.tasks_completed || 0;

        const score = (totalInteractions * 2) + (referralsGenerated * 5) + (referralsConverted * 10) + (tasksCompleted * 1);

        return {
          userId: u.id,
          name: u.name,
          role: u.role,
          totalInteractions,
          visits: u.visits || 0,
          calls: u.calls || 0,
          emails: u.emails || 0,
          lunches: u.lunches || 0,
          uniqueProvidersTouched: u.unique_providers_touched || 0,
          referralsGenerated,
          referralsConverted,
          totalVisits: refs.total_visits || 0,
          tasksCompleted,
          tasksOpen: tsks.tasks_open || 0,
          performanceScore: score,
        };
      }).sort((a, b) => b.performanceScore - a.performanceScore);

      res.json({
        leaderboard,
        dateRange: { from: dateFrom, to: dateTo },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/physicians/:id/stage-history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getPhysicianStageHistory(req.params.id);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
