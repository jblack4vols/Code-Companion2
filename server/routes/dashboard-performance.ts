import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuth, requireRole, qstr, getUserLocationScope } from "./shared";

// Location-level performance scorecards extracted from dashboard.ts (R2-13).
// All endpoints are aggregate SELECTs over referrals/locations returning
// per-location rollups; grouped here to keep dashboard.ts focused on the
// core dashboard views.
export function registerDashboardPerformanceRoutes(app: Express) {
  app.get("/api/dashboard/kpis", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const locationId = qstr(req.query.locationId as any);
      const locFilter = locationId ? sql`AND r.location_id = ${locationId}` : sql``;

      const result = await db.execute(sql`
        WITH current_period AS (
          SELECT
            COUNT(*) as total_referrals,
            COUNT(*) FILTER (WHERE status = 'EVAL_COMPLETED' OR status = 'DISCHARGED') as arrived,
            COUNT(*) FILTER (WHERE status = 'SCHEDULED') as scheduled,
            COUNT(*) FILTER (WHERE status = 'LOST') as lost
          FROM referrals r
          WHERE r.deleted_at IS NULL
            AND r.referral_date >= CURRENT_DATE - INTERVAL '30 days'
            ${locFilter}
        ),
        prior_period AS (
          SELECT
            COUNT(*) as total_referrals,
            COUNT(*) FILTER (WHERE status = 'EVAL_COMPLETED' OR status = 'DISCHARGED') as arrived
          FROM referrals r
          WHERE r.deleted_at IS NULL
            AND r.referral_date >= CURRENT_DATE - INTERVAL '60 days'
            AND r.referral_date < CURRENT_DATE - INTERVAL '30 days'
            ${locFilter}
        ),
        weekly AS (
          SELECT
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '7 days') as this_week,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '14 days' AND r.referral_date < CURRENT_DATE - INTERVAL '7 days') as last_week
          FROM referrals r
          WHERE r.deleted_at IS NULL
            ${locFilter}
        )
        SELECT
          cp.total_referrals as visits,
          cp.arrived,
          cp.scheduled,
          cp.lost as cancellations,
          CASE WHEN cp.total_referrals > 0 THEN ROUND(cp.arrived::numeric / cp.total_referrals * 100, 1) ELSE 0 END as arrival_rate,
          pp.total_referrals as prior_visits,
          pp.arrived as prior_arrived,
          CASE WHEN pp.total_referrals > 0 THEN ROUND(pp.arrived::numeric / pp.total_referrals * 100, 1) ELSE 0 END as prior_arrival_rate,
          w.this_week,
          w.last_week,
          CASE WHEN w.last_week > 0 THEN ROUND((w.this_week - w.last_week)::numeric / w.last_week * 100, 1) ELSE 0 END as wow_change
        FROM current_period cp, prior_period pp, weekly w
      `);

      res.json(result.rows[0] || {});
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/alerts", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const alerts: Array<{ type: string; severity: string; message: string; value: number; threshold: number }> = [];

      const result = await db.execute(sql`
        WITH by_location AS (
          SELECT
            l.id as location_id,
            l.name as location_name,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') as current_referrals,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') as prior_referrals,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days' AND (r.status = 'EVAL_COMPLETED' OR r.status = 'DISCHARGED')) as arrived_current,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '7 days') as this_week,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '14 days' AND r.referral_date < CURRENT_DATE - INTERVAL '7 days') as last_week
          FROM locations l
          LEFT JOIN referrals r ON r.location_id = l.id AND r.deleted_at IS NULL
          WHERE l.is_active = true
          GROUP BY l.id, l.name
        )
        SELECT * FROM by_location
      `);

      for (const row of result.rows as any[]) {
        const arrivalRate = row.current_referrals > 0
          ? (row.arrived_current / row.current_referrals) * 100
          : 100;
        if (arrivalRate < 85 && row.current_referrals > 0) {
          alerts.push({
            type: "LOW_ARRIVAL_RATE",
            severity: "warning",
            message: `${row.location_name}: Arrival rate ${arrivalRate.toFixed(1)}% (below 85% threshold)`,
            value: arrivalRate,
            threshold: 85,
          });
        }

        if (row.last_week > 0) {
          const wowChange = ((row.this_week - row.last_week) / row.last_week) * 100;
          if (wowChange < -10) {
            alerts.push({
              type: "VISIT_DROP_WOW",
              severity: "critical",
              message: `${row.location_name}: Visit volume dropped ${Math.abs(wowChange).toFixed(1)}% week-over-week`,
              value: wowChange,
              threshold: -10,
            });
          }
        }

        if (row.prior_referrals > 0) {
          const change = ((row.current_referrals - row.prior_referrals) / row.prior_referrals) * 100;
          if (change < -5) {
            alerts.push({
              type: "REFERRAL_DROP",
              severity: "warning",
              message: `${row.location_name}: Referral volume dropped ${Math.abs(change).toFixed(1)}% vs prior period`,
              value: change,
              threshold: -5,
            });
          }
        }
      }

      alerts.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
      res.json(alerts);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/location-conversion", requireAuth, async (req, res) => {
    try {
      const locationScope = await getUserLocationScope(req);
      const startDate = qstr(req.query.startDate as any);
      const endDate = qstr(req.query.endDate as any);

      const dateFilter = startDate && endDate
        ? sql`AND r.referral_date >= ${startDate} AND r.referral_date <= ${endDate}`
        : startDate ? sql`AND r.referral_date >= ${startDate}`
        : endDate ? sql`AND r.referral_date <= ${endDate}`
        : sql`AND r.referral_date >= CURRENT_DATE - INTERVAL '30 days'`;

      const locScopeFilter = locationScope !== null && locationScope.length > 0
        ? sql`AND l.id = ANY(${locationScope})`
        : locationScope !== null && locationScope.length === 0
        ? sql`AND 1=0`
        : sql``;

      const result = await db.execute(sql`
        SELECT
          l.id as location_id,
          l.name as location_name,
          COALESCE(SUM(r.scheduled_visits), 0)::int as total_scheduled,
          COALESCE(SUM(r.arrived_visits), 0)::int as total_arrived,
          COUNT(r.id)::int as total_referrals,
          CASE
            WHEN COALESCE(SUM(r.scheduled_visits), 0) > 0
            THEN ROUND(COALESCE(SUM(r.arrived_visits), 0)::numeric / SUM(r.scheduled_visits) * 100, 1)
            ELSE 0
          END as arrival_rate
        FROM locations l
        LEFT JOIN referrals r ON r.location_id = l.id AND r.deleted_at IS NULL ${dateFilter}
        WHERE l.is_active = true ${locScopeFilter}
        GROUP BY l.id, l.name
        HAVING COUNT(r.id) > 0
        ORDER BY total_scheduled DESC
      `);

      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/location-performance", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          l.id as location_id,
          l.name as location_name,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') as referrals_30d,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days' AND (r.status = 'EVAL_COMPLETED' OR r.status = 'DISCHARGED')) as arrived_30d,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days' AND r.status = 'SCHEDULED') as scheduled_30d,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days' AND r.status = 'LOST') as lost_30d,
          CASE
            WHEN COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') > 0
            THEN ROUND(
              COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days' AND (r.status = 'EVAL_COMPLETED' OR r.status = 'DISCHARGED'))::numeric
              / COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') * 100, 1
            )
            ELSE 0
          END as arrival_rate,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') as referrals_prior_30d
        FROM locations l
        LEFT JOIN referrals r ON r.location_id = l.id AND r.deleted_at IS NULL
        WHERE l.is_active = true
        GROUP BY l.id, l.name
        ORDER BY referrals_30d DESC
      `);

      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
