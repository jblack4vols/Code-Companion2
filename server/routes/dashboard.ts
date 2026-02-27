import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq, and, gte, lt, lte, isNull, asc, desc } from "drizzle-orm";
import { referrals as referralsTable, calendarEvents, tasks, interactions, physicians, locations } from "@shared/schema";
import { requireAuth, requireRole, getClientIp, qstr } from "./shared";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/tiering-weights", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    const weights = await storage.getTieringWeights();
    res.json(weights || {});
  });

  app.patch("/api/tiering-weights", requireRole("OWNER"), async (req, res) => {
    try {
      const updated = await storage.updateTieringWeights(req.body);
      if (!updated) return res.status(404).json({ message: "No weights configured" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "TieringWeights", entityId: updated.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/etl/run", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { triggerETL, triggerFullETL } = await import("../etl");
      const fullRecompute = req.body?.fullRecompute === true;
      res.json({ message: `ETL started (${fullRecompute ? "full" : "incremental"})` });
      if (fullRecompute) {
        triggerFullETL().catch(err => console.error("[ETL] Manual trigger error:", err));
      } else {
        triggerETL().catch(err => console.error("[ETL] Manual trigger error:", err));
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/executive", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";
    const summaries = await storage.getPhysicianMonthlySummaries({ month });
    const historicalSummaries = await storage.getPhysicianMonthlySummaries({ months: 6 });

    const sortByRevenueOrCount = (a: any, b: any) => {
      const revA = parseFloat(String(a.revenueGenerated || 0));
      const revB = parseFloat(String(b.revenueGenerated || 0));
      if (revA !== revB) return revB - revA;
      return (b.referralsCount || 0) - (a.referralsCount || 0);
    };

    const topByRevenue = [...summaries]
      .sort(sortByRevenueOrCount)
      .slice(0, 20);

    const totalRevenue = summaries.reduce((sum, s) => sum + parseFloat(String(s.revenueGenerated || 0)), 0);
    const totalRefs = summaries.reduce((sum, s) => sum + (s.referralsCount || 0), 0);
    const top10Revenue = [...summaries]
      .sort(sortByRevenueOrCount)
      .slice(0, 10)
      .reduce((sum, s) => sum + parseFloat(String(s.revenueGenerated || 0)), 0);
    const top10Refs = [...summaries]
      .sort(sortByRevenueOrCount)
      .slice(0, 10)
      .reduce((sum, s) => sum + (s.referralsCount || 0), 0);
    const concentrationRisk = totalRevenue > 0
      ? top10Revenue / totalRevenue
      : totalRefs > 0 ? top10Refs / totalRefs : 0;

    const monthlyTotals: Record<string, number> = {};
    const monthlyRevenue: Record<string, number> = {};
    for (const s of historicalSummaries) {
      const m = String(s.month);
      monthlyTotals[m] = (monthlyTotals[m] || 0) + s.referralsCount;
      monthlyRevenue[m] = (monthlyRevenue[m] || 0) + parseFloat(String(s.revenueGenerated || 0));
    }
    const monthKeys = Object.keys(monthlyTotals).sort();
    const growthRates = monthKeys.slice(1).map((m, i) => {
      const prev = monthlyTotals[monthKeys[i]] || 1;
      return ((monthlyTotals[m] - prev) / prev) * 100;
    });

    const vals = Object.values(monthlyTotals);
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const variance = vals.length > 0 ? vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length : 0;
    const volatilityIndex = mean > 0 ? Math.sqrt(variance) / mean : 0;

    res.json({
      month,
      topReferrersByRevenue: topByRevenue,
      totalRevenue,
      concentrationRisk,
      growthRates: monthKeys.slice(1).map((m, i) => ({ month: m, rate: growthRates[i] })),
      volatilityIndex,
      totalReferrals: summaries.reduce((sum, s) => sum + s.referralsCount, 0),
      monthlyTotals,
      monthlyRevenue,
    });
  });

  app.get("/api/dashboard/territory/:territoryId", requireAuth, async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";
    const summary = await storage.getTerritoryMonthlySummaries({ territoryId: req.params.territoryId, month });
    const territory = await storage.getTerritory(req.params.territoryId);
    res.json({ territory, summaries: summary, month });
  });

  app.get("/api/dashboard/location/:locationId", requireAuth, async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";
    const summaries = await storage.getLocationMonthlySummaries({ locationId: req.params.locationId, month });
    const loc = await storage.getLocation(req.params.locationId);

    const monthStart = new Date(month);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const locationReferrals = await db.select().from(referralsTable).where(
      and(
        eq(referralsTable.locationId, req.params.locationId),
        gte(referralsTable.referralDate, monthStart.toISOString().slice(0, 10)),
        lt(referralsTable.referralDate, monthEnd.toISOString().slice(0, 10))
      )
    );

    const physicianCounts: Record<string, { physicianId: string; npi: string | null; name: string; count: number }> = {};
    for (const r of locationReferrals) {
      if (r.physicianId) {
        if (!physicianCounts[r.physicianId]) {
          physicianCounts[r.physicianId] = {
            physicianId: r.physicianId,
            npi: r.referringProviderNpi || null,
            name: r.referringProviderName || "Unknown",
            count: 0,
          };
        }
        physicianCounts[r.physicianId].count++;
      }
    }
    const topReferrers = Object.values(physicianCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Conversion metrics: scheduled → arrived
    const totalScheduled = locationReferrals.reduce((sum, r) => sum + (r.scheduledVisits || 0), 0);
    const totalArrived = locationReferrals.reduce((sum, r) => sum + (r.arrivedVisits || 0), 0);
    const arrivalRate = totalScheduled > 0 ? Math.round((totalArrived / totalScheduled) * 1000) / 10 : 0;

    res.json({ location: loc, summaries, month, topReferrers, conversionMetrics: { totalScheduled, totalArrived, arrivalRate } });
  });

  app.get("/api/physicians/:id/monthly", requireAuth, async (req, res) => {
    const months = req.query.months ? parseInt(req.query.months as string) : 6;
    const summaries = await storage.getPhysicianMonthlySummaries({ physicianId: req.params.id, months });
    res.json(summaries);
  });

  app.get("/api/dashboard/funnel", requireAuth, async (req, res) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const locationId = req.query.locationId as string | undefined;
      const territoryId = req.query.territoryId as string | undefined;

      const dateFilter = startDate && endDate
        ? sql`AND r.referral_date >= ${startDate} AND r.referral_date <= ${endDate}`
        : startDate ? sql`AND r.referral_date >= ${startDate}`
        : endDate ? sql`AND r.referral_date <= ${endDate}`
        : sql``;

      const locFilter = locationId ? sql`AND r.location_id = ${locationId}` : sql``;
      const terrFilter = territoryId
        ? sql`AND r.physician_id IN (SELECT id FROM physicians WHERE territory_id = ${territoryId} AND deleted_at IS NULL)`
        : sql``;

      const result = await db.execute(sql`
        SELECT 
          COUNT(*)::int as received,
          COUNT(CASE WHEN r.status IN ('SCHEDULED','EVAL_COMPLETED','DISCHARGED') THEN 1 END)::int as scheduled,
          COUNT(CASE WHEN r.arrived_visits > 0 THEN 1 END)::int as arrived,
          COUNT(CASE WHEN r.status = 'DISCHARGED' THEN 1 END)::int as discharged
        FROM referrals r
        WHERE r.deleted_at IS NULL ${dateFilter} ${locFilter} ${terrFilter}
      `);

      const row = (result.rows as any[])[0] || { received: 0, scheduled: 0, arrived: 0, discharged: 0 };
      res.json([
        { stage: "Received", count: row.received },
        { stage: "Scheduled", count: row.scheduled },
        { stage: "Arrived", count: row.arrived },
        { stage: "Discharged", count: row.discharged },
      ]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/correlation", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          p.id as "physicianId",
          CONCAT(p.first_name, ' ', p.last_name) as name,
          p.relationship_stage as stage,
          COALESCE(ref_counts.ref_count, 0)::int as referrals,
          COALESCE(int_counts.int_count, 0)::int as interactions
        FROM physicians p
        LEFT JOIN (
          SELECT physician_id, COUNT(*)::int as ref_count
          FROM referrals WHERE deleted_at IS NULL
          GROUP BY physician_id
        ) ref_counts ON ref_counts.physician_id = p.id
        LEFT JOIN (
          SELECT physician_id, COUNT(*)::int as int_count
          FROM interactions WHERE deleted_at IS NULL
          GROUP BY physician_id
        ) int_counts ON int_counts.physician_id = p.id
        WHERE p.deleted_at IS NULL
          AND (COALESCE(ref_counts.ref_count, 0) > 0 OR COALESCE(int_counts.int_count, 0) > 0)
        ORDER BY referrals DESC
        LIMIT 100
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/geographic", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          COALESCE(l.city, 'Unknown') as city,
          l.state,
          COUNT(r.id)::int as referrals,
          COUNT(DISTINCT r.physician_id)::int as providers
        FROM referrals r
        LEFT JOIN locations l ON r.location_id = l.id
        WHERE r.deleted_at IS NULL
        GROUP BY l.city, l.state
        HAVING COUNT(r.id) > 0
        ORDER BY referrals DESC
        LIMIT 30
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      locationId: req.query.locationId as string | undefined,
      territoryId: req.query.territoryId as string | undefined,
      physicianId: req.query.physicianId as string | undefined,
    };
    res.json(await storage.getDashboardStats(filters));
  });

  app.get("/api/activity-feed", requireRole("OWNER", "DIRECTOR", "MARKETER", "ANALYST"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const recentInteractions = await db.execute(sql`
        SELECT i.id, i.type, i.summary, i.occurred_at as "timestamp", 
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name, 'interaction' as activity_type
        FROM interactions i
        LEFT JOIN physicians p ON i.physician_id = p.id
        LEFT JOIN users u ON i.user_id = u.id
        WHERE i.deleted_at IS NULL
        ORDER BY i.occurred_at DESC LIMIT ${limit}
      `);
      const recentTasks = await db.execute(sql`
        SELECT t.id, t.description as summary, t.status, t.updated_at as "timestamp",
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name, 'task' as activity_type
        FROM tasks t
        LEFT JOIN physicians p ON t.physician_id = p.id
        LEFT JOIN users u ON t.assigned_to_user_id = u.id
        WHERE t.status = 'DONE'
        ORDER BY t.updated_at DESC LIMIT ${limit}
      `);
      const recentReferrals = await db.execute(sql`
        SELECT r.id, r.case_title as summary, r.referral_date as "timestamp",
          COALESCE(r.referring_provider_name, CONCAT(p.first_name, ' ', p.last_name)) as physician_name,
          l.name as location_name, 'referral' as activity_type
        FROM referrals r
        LEFT JOIN physicians p ON r.physician_id = p.id
        LEFT JOIN locations l ON r.location_id = l.id
        WHERE r.deleted_at IS NULL
        ORDER BY r.created_at DESC LIMIT ${limit}
      `);
      const combined = [
        ...(recentInteractions.rows as any[]).map(r => ({ ...r, activity_type: 'interaction' })),
        ...(recentTasks.rows as any[]).map(r => ({ ...r, activity_type: 'task' })),
        ...(recentReferrals.rows as any[]).map(r => ({ ...r, activity_type: 'referral' })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reports/user-activity", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const dateFrom = qstr(req.query.dateFrom as any);
      const dateTo = qstr(req.query.dateTo as any);
      const dateCondition = dateFrom && dateTo
        ? sql`AND i.occurred_at >= ${dateFrom}::date AND i.occurred_at <= ${dateTo}::date`
        : dateFrom ? sql`AND i.occurred_at >= ${dateFrom}::date`
        : dateTo ? sql`AND i.occurred_at <= ${dateTo}::date`
        : sql``;

      const taskDateCond = dateFrom && dateTo
        ? sql`AND t.updated_at >= ${dateFrom}::date AND t.updated_at <= ${dateTo}::date`
        : dateFrom ? sql`AND t.updated_at >= ${dateFrom}::date`
        : dateTo ? sql`AND t.updated_at <= ${dateTo}::date`
        : sql``;

      const interactionCounts = await db.execute(sql`
        SELECT u.id, u.name, u.role, COUNT(i.id)::int as interaction_count,
          COUNT(CASE WHEN i.type = 'VISIT' THEN 1 END)::int as visit_count,
          COUNT(CASE WHEN i.type = 'CALL' THEN 1 END)::int as call_count,
          COUNT(CASE WHEN i.type = 'EMAIL' THEN 1 END)::int as email_count,
          COUNT(CASE WHEN i.type = 'LUNCH' THEN 1 END)::int as lunch_count
        FROM users u
        LEFT JOIN interactions i ON u.id = i.user_id AND i.deleted_at IS NULL ${dateCondition}
        GROUP BY u.id, u.name, u.role
        ORDER BY interaction_count DESC
      `);

      const taskCounts = await db.execute(sql`
        SELECT u.id, 
          COUNT(CASE WHEN t.status = 'DONE' THEN 1 END)::int as tasks_completed,
          COUNT(CASE WHEN t.status = 'OPEN' THEN 1 END)::int as tasks_open,
          COUNT(CASE WHEN t.status = 'DONE' AND t.updated_at <= t.due_at THEN 1 END)::int as tasks_on_time
        FROM users u
        LEFT JOIN tasks t ON u.id = t.assigned_to_user_id ${taskDateCond}
        GROUP BY u.id
      `);

      const taskMap = new Map((taskCounts.rows as any[]).map(r => [r.id, r]));
      const result = (interactionCounts.rows as any[]).map(u => ({
        ...u,
        tasks_completed: taskMap.get(u.id)?.tasks_completed || 0,
        tasks_open: taskMap.get(u.id)?.tasks_open || 0,
        tasks_on_time: taskMap.get(u.id)?.tasks_on_time || 0,
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/hit-list", requireAuth, async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }
      const start = new Date(startDate);
      const end = new Date(endDate);

      const [events, taskList, followUps] = await Promise.all([
        db.select({
          id: calendarEvents.id,
          title: calendarEvents.title,
          eventType: calendarEvents.eventType,
          startAt: calendarEvents.startAt,
          endAt: calendarEvents.endAt,
          allDay: calendarEvents.allDay,
          completed: calendarEvents.completed,
          locationId: calendarEvents.locationId,
          practiceName: calendarEvents.practiceName,
          physicianId: calendarEvents.physicianId,
          description: calendarEvents.description,
          locationName: locations.name,
          physicianFirstName: physicians.firstName,
          physicianLastName: physicians.lastName,
        })
          .from(calendarEvents)
          .leftJoin(locations, eq(calendarEvents.locationId, locations.id))
          .leftJoin(physicians, eq(calendarEvents.physicianId, physicians.id))
          .where(and(gte(calendarEvents.startAt, start), lte(calendarEvents.startAt, end)))
          .orderBy(asc(calendarEvents.startAt)),

        db.select({
          id: tasks.id,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          dueAt: tasks.dueAt,
          physicianId: tasks.physicianId,
          physicianFirstName: physicians.firstName,
          physicianLastName: physicians.lastName,
        })
          .from(tasks)
          .leftJoin(physicians, eq(tasks.physicianId, physicians.id))
          .where(and(gte(tasks.dueAt, start), lte(tasks.dueAt, end)))
          .orderBy(asc(tasks.dueAt)),

        db.select({
          id: interactions.id,
          type: interactions.type,
          summary: interactions.summary,
          followUpDueAt: interactions.followUpDueAt,
          physicianId: interactions.physicianId,
          physicianFirstName: physicians.firstName,
          physicianLastName: physicians.lastName,
          locationName: locations.name,
        })
          .from(interactions)
          .leftJoin(physicians, eq(interactions.physicianId, physicians.id))
          .leftJoin(locations, eq(interactions.locationId, locations.id))
          .where(and(
            gte(interactions.followUpDueAt, start),
            lte(interactions.followUpDueAt, end),
            isNull(interactions.deletedAt),
          ))
          .orderBy(asc(interactions.followUpDueAt)),
      ]);

      res.json({ events, tasks: taskList, followUps });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
