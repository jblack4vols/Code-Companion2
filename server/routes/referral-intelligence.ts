/**
 * Referral Intelligence routes — ROI scoring, gone-dark detection, YoY deltas.
 * Roles: OWNER=full, DIRECTOR=read+manage, ANALYST=read-only, others=403.
 */
import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireRole, getUserLocationScope } from "./shared";

/** Tier multipliers for ROI score calculation */
const TIER_MULTIPLIER: Record<string, number> = { A: 1.0, B: 0.85, C: 0.60, D: 0.40 };
const ROI_DIVISOR = 400;

function computeRoi(casesYtd: number, avgVisits: number, tierLabel: string): number {
  const mult = TIER_MULTIPLIER[tierLabel] ?? 0.40;
  const raw = (casesYtd * avgVisits * mult) / ROI_DIVISOR * 100;
  return Math.min(Math.round(raw * 10) / 10, 100);
}

/** Dominant payer bucket from a comma-joined payer string */
function dominantPayer(payerCsv: string | null): string {
  if (!payerCsv) return "commercial";
  const p = payerCsv.toLowerCase();
  if (p.includes("medicare")) return "medicare";
  if (p.includes("medicaid")) return "medicaid";
  if (p.includes("workers") || p.includes("comp")) return "workersComp";
  if (p.includes("self") || p.includes("cash")) return "selfPay";
  return "commercial";
}

async function fetchPhysicianIntelligence(locationScope: string[] | null) {
  const locFilter = locationScope !== null
    ? sql`AND r.location_id = ANY(${locationScope})`
    : sql``;

  const currentYear = new Date().getFullYear();
  const priorYear = currentYear - 1;
  const now = new Date();
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const oneTwentyDaysAgo = new Date(now);
  oneTwentyDaysAgo.setDate(oneTwentyDaysAgo.getDate() - 120);

  const rows = await db.execute(sql`
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.specialty,
      p.practice_name,
      p.relationship_stage,
      p.deleted_at,
      -- YTD cases
      COUNT(DISTINCT CASE WHEN EXTRACT(year FROM r.referral_date::date) = ${currentYear} THEN r.id END)::int   AS cases_ytd,
      -- prior year cases
      COUNT(DISTINCT CASE WHEN EXTRACT(year FROM r.referral_date::date) = ${priorYear} THEN r.id END)::int    AS cases_prior_year,
      -- avg visits per case (all time)
      CASE WHEN COUNT(r.id) > 0
        THEN ROUND(COALESCE(SUM(r.arrived_visits), 0)::numeric / COUNT(r.id), 2)
        ELSE 0
      END AS avg_visits_per_case,
      -- last referral date
      MAX(r.referral_date)::text AS last_referral_date,
      -- recent 60-day window count
      COUNT(DISTINCT CASE WHEN r.referral_date >= ${sixtyDaysAgo.toISOString().slice(0, 10)} THEN r.id END)::int  AS refs_last_60,
      -- prior 60-day window count (60-120 days ago)
      COUNT(DISTINCT CASE WHEN r.referral_date >= ${oneTwentyDaysAgo.toISOString().slice(0, 10)}
                           AND r.referral_date < ${sixtyDaysAgo.toISOString().slice(0, 10)} THEN r.id END)::int  AS refs_prior_60,
      -- dominant payer
      mode() WITHIN GROUP (ORDER BY r.primary_payer_type) AS dominant_payer_type,
      -- best tier label from monthly summary
      COALESCE(
        (SELECT pms.tier_label FROM physician_monthly_summary pms
         WHERE pms.physician_id = p.id ORDER BY pms.month DESC LIMIT 1),
        'D'
      ) AS tier_label
    FROM physicians p
    LEFT JOIN referrals r ON r.physician_id = p.id AND r.deleted_at IS NULL ${locFilter}
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.first_name, p.last_name, p.specialty, p.practice_name, p.relationship_stage, p.deleted_at
    HAVING COUNT(r.id) > 0
    ORDER BY cases_ytd DESC
  `);

  return (rows.rows as any[]).map(r => {
    const casesYtd = r.cases_ytd ?? 0;
    const casesPrior = r.cases_prior_year ?? 0;
    const avgVisits = parseFloat(r.avg_visits_per_case) || 0;
    const tierLabel: string = r.tier_label ?? "D";
    const roiScore = computeRoi(casesYtd, avgVisits, tierLabel);
    const yoyDelta = casesPrior > 0
      ? Math.round(((casesYtd - casesPrior) / casesPrior) * 1000) / 10
      : casesYtd > 0 ? 100 : 0;
    const goneDark = r.refs_last_60 === 0 && r.refs_prior_60 >= 2;
    const lastDate = r.last_referral_date ? r.last_referral_date.slice(0, 10) : null;
    const daysSince = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000)
      : null;

    return {
      physicianId: r.id,
      name: `${r.first_name} ${r.last_name}`,
      specialty: r.specialty ?? null,
      practiceName: r.practice_name ?? null,
      relationshipStage: r.relationship_stage,
      tierLabel,
      roiScore,
      casesYtd,
      casesPriorYear: casesPrior,
      avgVisitsPerCase: avgVisits,
      yoyDelta,
      goneDark,
      lastReferralDate: lastDate,
      daysSinceLastReferral: daysSince,
      payerTier: dominantPayer(r.dominant_payer_type),
    };
  });
}

export function registerReferralIntelligenceRoutes(app: Express) {
  // GET /api/referral-intelligence — all physicians sorted by ROI
  app.get(
    "/api/referral-intelligence",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        if (locationScope !== null && locationScope.length === 0) {
          return res.json([]);
        }
        const data = await fetchPhysicianIntelligence(locationScope);
        data.sort((a, b) => b.roiScore - a.roiScore);
        res.json(data);
      } catch (err: any) {
        console.error("[referral-intelligence]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // GET /api/referral-intelligence/gone-dark — only gone-dark physicians
  app.get(
    "/api/referral-intelligence/gone-dark",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        if (locationScope !== null && locationScope.length === 0) {
          return res.json([]);
        }
        const data = await fetchPhysicianIntelligence(locationScope);
        res.json(data.filter(p => p.goneDark).sort((a, b) => b.roiScore - a.roiScore));
      } catch (err: any) {
        console.error("[referral-intelligence/gone-dark]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // GET /api/referral-intelligence/summary — aggregate metrics
  app.get(
    "/api/referral-intelligence/summary",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        if (locationScope !== null && locationScope.length === 0) {
          return res.json({ activeReferrers: 0, casesYtd: 0, yoyPct: 0, tierAPct: 0, goneDarkCount: 0 });
        }
        const data = await fetchPhysicianIntelligence(locationScope);

        const currentYear = new Date().getFullYear();
        const priorYear = currentYear - 1;
        const casesYtd = data.reduce((s, p) => s + p.casesYtd, 0);
        const casesPrior = data.reduce((s, p) => s + p.casesPriorYear, 0);
        const yoyPct = casesPrior > 0 ? Math.round(((casesYtd - casesPrior) / casesPrior) * 1000) / 10 : 0;
        const tierACount = data.filter(p => p.tierLabel === "A").length;
        const tierAPct = data.length > 0 ? Math.round((tierACount / data.length) * 1000) / 10 : 0;
        const goneDarkCount = data.filter(p => p.goneDark).length;

        res.json({
          activeReferrers: data.length,
          casesYtd,
          yoyPct,
          tierAPct,
          goneDarkCount,
        });
      } catch (err: any) {
        console.error("[referral-intelligence/summary]", err);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );
}
