/**
 * RPV (Revenue Per Visit) Analytics routes.
 * Roles: OWNER=full, DIRECTOR=read+manage, ANALYST=read-only, others=403.
 */
import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireRole, getUserLocationScope, qstr } from "./shared";

const RPV_TARGET = 95;

type PayerMix = { commercial: number; medicare: number; medicaid: number; selfPay: number; workersComp: number };
type RpvStatus = "on_target" | "near_target" | "critical";

function computeStatus(rpv: number): RpvStatus {
  if (rpv >= RPV_TARGET) return "on_target";
  if (rpv >= 90) return "near_target";
  return "critical";
}

/** Normalise payer type strings into one of the 5 buckets */
function bucketPayer(raw: string | null): keyof PayerMix {
  const p = (raw || "").toLowerCase();
  if (p.includes("medicare")) return "medicare";
  if (p.includes("medicaid")) return "medicaid";
  if (p.includes("workers") || p.includes("comp")) return "workersComp";
  if (p.includes("self") || p.includes("cash")) return "selfPay";
  return "commercial";
}

export function registerRpvAnalyticsRoutes(app: Express) {
  // GET /api/rpv/by-location — latest RPV + payer mix per location
  app.get(
    "/api/rpv/by-location",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        if (locationScope !== null && locationScope.length === 0) {
          return res.json({ locations: [], summary: { systemRpv: 0, totalVisits: 0, totalMonthlyGap: 0, locationsAtTarget: 0, locationsNearTarget: 0, locationsCritical: 0 } });
        }

        const locFilter = locationScope !== null
          ? sql`AND cf.location_id = ANY(${locationScope})`
          : sql``;

        // Most-recent period per location
        const financials = await db.execute(sql`
          SELECT
            cf.location_id,
            l.name as location_name,
            cf.gross_revenue,
            cf.total_visits
          FROM clinic_financials cf
          JOIN locations l ON l.id = cf.location_id
          WHERE cf.total_visits > 0
            ${locFilter}
          ORDER BY cf.period_date DESC
        `);

        // Collapse to most-recent row per location
        const latestByLoc = new Map<string, any>();
        for (const row of financials.rows as any[]) {
          if (!latestByLoc.has(row.location_id)) {
            latestByLoc.set(row.location_id, row);
          }
        }

        if (latestByLoc.size === 0) {
          return res.json({ locations: [], summary: { systemRpv: 0, totalVisits: 0, totalMonthlyGap: 0, locationsAtTarget: 0, locationsNearTarget: 0, locationsCritical: 0 } });
        }

        // Payer mix per location from referrals
        const payerRows = await db.execute(sql`
          SELECT location_id, primary_payer_type, COUNT(*)::int as cnt
          FROM referrals
          WHERE deleted_at IS NULL
          GROUP BY location_id, primary_payer_type
        `);

        const payersByLoc = new Map<string, Map<string, number>>();
        for (const row of payerRows.rows as any[]) {
          if (!payersByLoc.has(row.location_id)) payersByLoc.set(row.location_id, new Map());
          payersByLoc.get(row.location_id)!.set(row.primary_payer_type, row.cnt);
        }

        const buildPayerMix = (locId: string): PayerMix => {
          const buckets = payersByLoc.get(locId);
          const mix: PayerMix = { commercial: 0, medicare: 0, medicaid: 0, selfPay: 0, workersComp: 0 };
          if (!buckets) return mix;
          let total = 0;
          const counts: PayerMix = { commercial: 0, medicare: 0, medicaid: 0, selfPay: 0, workersComp: 0 };
          for (const [payer, cnt] of Array.from(buckets)) {
            const bucket = bucketPayer(payer);
            counts[bucket] += cnt;
            total += cnt;
          }
          if (total === 0) return mix;
          for (const key of Object.keys(counts) as (keyof PayerMix)[]) {
            mix[key] = Math.round((counts[key] / total) * 1000) / 10;
          }
          return mix;
        };

        let totalRevenue = 0;
        let totalVisits = 0;
        const locations: any[] = [];

        for (const [locationId, row] of Array.from(latestByLoc)) {
          const visits = Number(row.total_visits) || 0;
          const revenue = parseFloat(row.gross_revenue) || 0;
          const rpv = visits > 0 ? Math.round((revenue / visits) * 100) / 100 : 0;
          const gapToTarget = Math.round((rpv - RPV_TARGET) * 100) / 100;
          const monthlyGapDollars = Math.round(gapToTarget * visits);
          totalRevenue += revenue;
          totalVisits += visits;
          locations.push({
            locationId,
            locationName: row.location_name,
            rpvActual: rpv,
            visits,
            grossRevenue: revenue,
            gapToTarget,
            monthlyGapDollars,
            status: computeStatus(rpv),
            payerMix: buildPayerMix(locationId),
          });
        }

        const systemRpv = totalVisits > 0 ? Math.round((totalRevenue / totalVisits) * 100) / 100 : 0;
        const totalMonthlyGap = locations.reduce((s, l) => s + l.monthlyGapDollars, 0);
        const locationsAtTarget = locations.filter(l => l.status === "on_target").length;
        const locationsNearTarget = locations.filter(l => l.status === "near_target").length;
        const locationsCritical = locations.filter(l => l.status === "critical").length;

        res.json({
          locations,
          summary: { systemRpv, totalVisits, totalMonthlyGap, locationsAtTarget, locationsNearTarget, locationsCritical },
        });
      } catch (err: any) {
        console.error("[rpv/by-location]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // GET /api/rpv/trend/:locationId — RPV history over last 6 periods
  app.get(
    "/api/rpv/trend/:locationId",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        const locationId = String(req.params.locationId);
        if (locationScope !== null && !locationScope.includes(locationId)) {
          return res.status(403).json({ message: "Forbidden: no access to this location" });
        }

        const rows = await db.execute(sql`
          SELECT period_date, gross_revenue, total_visits
          FROM clinic_financials
          WHERE location_id = ${locationId}
            AND total_visits > 0
          ORDER BY period_date DESC
          LIMIT 6
        `);

        const periods = (rows.rows as any[]).map(r => ({
          periodDate: String(r.period_date).slice(0, 10),
          rpv: r.total_visits > 0 ? Math.round((parseFloat(r.gross_revenue) / r.total_visits) * 100) / 100 : 0,
          visits: Number(r.total_visits),
        })).reverse();

        res.json({ periods });
      } catch (err: any) {
        console.error("[rpv/trend]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );
}
