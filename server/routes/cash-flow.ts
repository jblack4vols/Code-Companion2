/**
 * Cash Flow Projection routes.
 * GET /api/cash-flow/projection — 13-week table (actuals + projected)
 * CRUD /api/cash-flow/scenarios — named assumption sets
 * POST /api/cash-flow/scenarios/default — auto-generate baseline from actuals
 */
import type { Express } from "express";
import { db } from "../db";
import { sql, eq, desc } from "drizzle-orm";
import { cashFlowScenarios, clinicFinancials } from "@shared/schema";
import { requireRole, getUserLocationScope } from "./shared";

function weekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

export function registerCashFlowRoutes(app: Express) {
  // GET projection — 8 weeks actuals + 5 weeks projected (or 13 actuals if no scenario)
  app.get(
    "/api/cash-flow/projection",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        if (locationScope !== null && locationScope.length === 0) {
          return res.json({ weeks: [], scenario: null, locationId: "all" });
        }

        const scenarioId = req.query.scenarioId as string | undefined;
        const locationId = req.query.locationId as string | undefined;

        const locFilter = locationId && locationId !== "all"
          ? sql`AND cf.location_id = ${locationId}`
          : locationScope !== null
            ? sql`AND cf.location_id = ANY(${locationScope})`
            : sql``;

        // Get last 13 weeks of actuals
        const now = new Date();
        const thirteenWeeksAgo = new Date(now);
        thirteenWeeksAgo.setDate(thirteenWeeksAgo.getDate() - 91);

        const rows = await db.execute(sql`
          SELECT
            date_trunc('week', cf.period_date::date)::date AS week_start,
            SUM(cf.gross_revenue::numeric)::numeric AS gross_revenue,
            SUM(cf.total_visits)::int AS total_visits,
            SUM(cf.labor_cost::numeric)::numeric AS labor_cost,
            SUM(cf.rent_cost::numeric)::numeric AS rent_cost,
            SUM(cf.supplies_cost::numeric)::numeric AS supplies_cost,
            SUM(cf.other_fixed_costs::numeric)::numeric AS other_costs
          FROM clinic_financials cf
          WHERE cf.period_date >= ${thirteenWeeksAgo.toISOString().slice(0, 10)}
            ${locFilter}
          GROUP BY date_trunc('week', cf.period_date::date)
          ORDER BY week_start
        `);

        const actualWeeks = (rows.rows as any[]).map(r => {
          const rev = parseFloat(r.gross_revenue) || 0;
          const labor = parseFloat(r.labor_cost) || 0;
          const rent = parseFloat(r.rent_cost) || 0;
          const supplies = parseFloat(r.supplies_cost) || 0;
          const other = parseFloat(r.other_costs) || 0;
          const totalExp = labor + rent + supplies + other;
          return {
            weekStart: r.week_start instanceof Date ? r.week_start.toISOString().slice(0, 10) : String(r.week_start).slice(0, 10),
            isActual: true,
            grossRevenue: Math.round(rev * 100) / 100,
            totalVisits: r.total_visits ?? 0,
            laborCost: Math.round(labor * 100) / 100,
            rentCost: Math.round(rent * 100) / 100,
            suppliesCost: Math.round(supplies * 100) / 100,
            otherCosts: Math.round(other * 100) / 100,
            totalExpenses: Math.round(totalExp * 100) / 100,
            netCash: Math.round((rev - totalExp) * 100) / 100,
            cumulativeNet: 0,
          };
        });

        // Take last 8 actuals (or fewer if not enough data)
        const recentActuals = actualWeeks.slice(-8);

        let projectedWeeks: typeof recentActuals = [];
        let scenarioInfo: { id: string; name: string } | null = null;

        if (scenarioId) {
          const [scenario] = await db.select().from(cashFlowScenarios).where(eq(cashFlowScenarios.id, scenarioId));
          if (scenario) {
            scenarioInfo = { id: scenario.id, name: scenario.name };
            const visits = scenario.weeklyVisits;
            const rpv = parseFloat(String(scenario.rpv));
            const laborPct = scenario.laborPct;
            const rent = parseFloat(String(scenario.weeklyRent));
            const supplies = parseFloat(String(scenario.weeklySupplies));
            const otherFixed = parseFloat(String(scenario.weeklyOther));

            // If location-specific, scale visits by location's share
            let visitScale = 1;
            if (locationId && locationId !== "all" && recentActuals.length > 0) {
              const totalSystemVisits = actualWeeks.reduce((s, w) => s + w.totalVisits, 0);
              const locVisits = recentActuals.reduce((s, w) => s + w.totalVisits, 0);
              visitScale = totalSystemVisits > 0 ? locVisits / totalSystemVisits : 0.125;
            }

            const lastActualDate = recentActuals.length > 0
              ? new Date(recentActuals[recentActuals.length - 1].weekStart)
              : new Date();

            for (let i = 1; i <= 5; i++) {
              const ws = new Date(lastActualDate);
              ws.setDate(ws.getDate() + i * 7);
              const scaledVisits = Math.round(visits * visitScale);
              const rev = scaledVisits * rpv;
              const labor = rev * laborPct;
              const totalExp = labor + rent * visitScale + supplies * visitScale + otherFixed * visitScale;
              projectedWeeks.push({
                weekStart: ws.toISOString().slice(0, 10),
                isActual: false,
                grossRevenue: Math.round(rev * 100) / 100,
                totalVisits: scaledVisits,
                laborCost: Math.round(labor * 100) / 100,
                rentCost: Math.round(rent * visitScale * 100) / 100,
                suppliesCost: Math.round(supplies * visitScale * 100) / 100,
                otherCosts: Math.round(otherFixed * visitScale * 100) / 100,
                totalExpenses: Math.round(totalExp * 100) / 100,
                netCash: Math.round((rev - totalExp) * 100) / 100,
                cumulativeNet: 0,
              });
            }
          }
        }

        const allWeeks = [...recentActuals, ...projectedWeeks];
        let cumulative = 0;
        for (const w of allWeeks) {
          cumulative += w.netCash;
          w.cumulativeNet = Math.round(cumulative * 100) / 100;
        }

        res.json({
          weeks: allWeeks,
          scenario: scenarioInfo,
          locationId: locationId || "all",
        });
      } catch (err: any) {
        console.error("[cash-flow]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // LIST scenarios
  app.get(
    "/api/cash-flow/scenarios",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (_req, res) => {
      try {
        const scenarios = await db.select().from(cashFlowScenarios).orderBy(desc(cashFlowScenarios.createdAt));
        res.json(scenarios);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // CREATE scenario
  app.post(
    "/api/cash-flow/scenarios",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const { name, weeklyVisits, rpv, laborPct, weeklyRent, weeklySupplies, weeklyOther } = req.body;
        if (!name || weeklyVisits == null || rpv == null || laborPct == null) {
          return res.status(400).json({ message: "Name, weeklyVisits, rpv, and laborPct are required" });
        }
        const [created] = await db.insert(cashFlowScenarios).values({
          name,
          createdBy: req.session.userId ?? null,
          weeklyVisits: Number(weeklyVisits),
          rpv: String(rpv),
          laborPct: Number(laborPct),
          weeklyRent: String(weeklyRent ?? 0),
          weeklySupplies: String(weeklySupplies ?? 0),
          weeklyOther: String(weeklyOther ?? 0),
        }).returning();
        res.json(created);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // UPDATE scenario
  app.patch(
    "/api/cash-flow/scenarios/:id",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const { name, weeklyVisits, rpv, laborPct, weeklyRent, weeklySupplies, weeklyOther } = req.body;
        const updates: any = { updatedAt: new Date() };
        if (name !== undefined) updates.name = name;
        if (weeklyVisits !== undefined) updates.weeklyVisits = Number(weeklyVisits);
        if (rpv !== undefined) updates.rpv = String(rpv);
        if (laborPct !== undefined) updates.laborPct = Number(laborPct);
        if (weeklyRent !== undefined) updates.weeklyRent = String(weeklyRent);
        if (weeklySupplies !== undefined) updates.weeklySupplies = String(weeklySupplies);
        if (weeklyOther !== undefined) updates.weeklyOther = String(weeklyOther);

        const [updated] = await db.update(cashFlowScenarios)
          .set(updates)
          .where(eq(cashFlowScenarios.id, String(req.params.id)))
          .returning();
        if (!updated) return res.status(404).json({ message: "Scenario not found" });
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // DELETE scenario
  app.delete(
    "/api/cash-flow/scenarios/:id",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const [deleted] = await db.delete(cashFlowScenarios)
          .where(eq(cashFlowScenarios.id, String(req.params.id)))
          .returning();
        if (!deleted) return res.status(404).json({ message: "Scenario not found" });
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // AUTO-GENERATE baseline scenario from recent actuals
  app.post(
    "/api/cash-flow/scenarios/default",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

        const rows = await db.execute(sql`
          SELECT
            AVG(cf.total_visits)::int AS avg_visits,
            CASE WHEN SUM(cf.total_visits) > 0
              THEN ROUND(SUM(cf.gross_revenue::numeric) / SUM(cf.total_visits), 2)
              ELSE 95
            END AS avg_rpv,
            CASE WHEN SUM(cf.gross_revenue::numeric) > 0
              THEN ROUND(SUM(cf.labor_cost::numeric) / SUM(cf.gross_revenue::numeric), 4)
              ELSE 0.65
            END AS avg_labor_pct,
            ROUND(AVG(cf.rent_cost::numeric), 2) AS avg_rent,
            ROUND(AVG(cf.supplies_cost::numeric), 2) AS avg_supplies,
            ROUND(AVG(cf.other_fixed_costs::numeric), 2) AS avg_other
          FROM clinic_financials cf
          WHERE cf.period_date >= ${fourWeeksAgo.toISOString().slice(0, 10)}
        `);

        const r = (rows.rows as any[])[0] || {};
        const [created] = await db.insert(cashFlowScenarios).values({
          name: "Baseline",
          createdBy: req.session.userId ?? null,
          weeklyVisits: r.avg_visits || 400,
          rpv: String(parseFloat(r.avg_rpv) || 95),
          laborPct: parseFloat(r.avg_labor_pct) || 0.65,
          weeklyRent: String(parseFloat(r.avg_rent) || 4000),
          weeklySupplies: String(parseFloat(r.avg_supplies) || 1200),
          weeklyOther: String(parseFloat(r.avg_other) || 2000),
        }).returning();

        res.json(created);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );
}
