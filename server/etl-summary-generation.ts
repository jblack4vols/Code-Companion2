/**
 * ETL monthly summary computation — physician, location, and territory rollups.
 * Called by etl.ts orchestrator. Does not import cron or schedule anything.
 */
import { db } from "./db";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  physicians, referrals, collections, locations, territories,
  physicianMonthlySummary, territoryMonthlySummary, locationMonthlySummary,
  tieringWeights,
} from "@shared/schema";

// ---- Date helpers ----

export function getMonthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getMonthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

export function getNextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

// ---- Types ----

type PhysSummary = {
  referralsCount: number; scheduledCount: number; evaluatedCount: number;
  arrivedCount: number; totalVisitsGenerated: number; revenueGenerated: number;
  commercialCount: number; totalPayerCount: number;
};

// ---- Physician monthly summaries ----

export async function computePhysicianMonthlySummaries(
  months: string[],
  allMonths: string[],
  allPhysicians: { id: string; territoryId: string | null }[],
  allReferrals: any[],
  allCollections: any[],
  weights: { revenueWeight: number; trendWeight: number; conversionWeight: number; payerMixWeight: number; tierAThreshold: number; tierBThreshold: number; tierCThreshold: number }
): Promise<Array<{ physicianId: string; month: string; tierLabel: "A" | "B" | "C" | "D"; [k: string]: any }>> {
  const physicianMonthlyData: Record<string, Record<string, PhysSummary>> = {};

  for (const physId of allPhysicians.map(p => p.id)) {
    physicianMonthlyData[physId] = {};
    for (const m of allMonths) {
      physicianMonthlyData[physId][m] = {
        referralsCount: 0, scheduledCount: 0, evaluatedCount: 0,
        arrivedCount: 0, totalVisitsGenerated: 0, revenueGenerated: 0,
        commercialCount: 0, totalPayerCount: 0,
      };
    }
  }

  for (const ref of allReferrals) {
    if (!ref.physicianId) continue;
    const refMonth = ref.referralDate.slice(0, 7) + "-01";
    if (!physicianMonthlyData[ref.physicianId]?.[refMonth]) continue;
    const s = physicianMonthlyData[ref.physicianId][refMonth];
    s.referralsCount++;
    if (ref.scheduledVisits && ref.scheduledVisits > 0) s.scheduledCount++;
    if (ref.status === "EVAL_COMPLETED" || ref.status === "DISCHARGED") s.evaluatedCount++;
    if (ref.arrivedVisits && ref.arrivedVisits > 0) { s.arrivedCount++; s.totalVisitsGenerated += ref.arrivedVisits; }
    if (ref.valueEstimate) s.revenueGenerated += ref.valueEstimate;
    if (ref.primaryPayerType) {
      s.totalPayerCount++;
      const pt = ref.primaryPayerType.toLowerCase();
      if (pt.includes("commercial") || pt.includes("bcbs") || pt.includes("blue") || pt.includes("aetna") || pt.includes("cigna") || pt.includes("united")) s.commercialCount++;
    } else if (ref.payerType) {
      s.totalPayerCount++;
      if (ref.payerType === "COMMERCIAL") s.commercialCount++;
    }
  }

  for (const col of allCollections) {
    if (!col.physicianId) continue;
    const colMonth = col.collectionDate.slice(0, 7) + "-01";
    if (!physicianMonthlyData[col.physicianId]?.[colMonth]) continue;
    physicianMonthlyData[col.physicianId][colMonth].revenueGenerated += parseFloat(String(col.amount));
  }

  const summaryRows: Array<any> = [];
  for (const physId of Object.keys(physicianMonthlyData)) {
    const monthData = physicianMonthlyData[physId];
    const sortedMonths = Object.keys(monthData).sort();
    for (let i = 0; i < sortedMonths.length; i++) {
      const m = sortedMonths[i];
      if (!months.includes(m)) continue;
      const d = monthData[m];
      const arrivalRate = d.scheduledCount > 0 ? d.arrivedCount / d.scheduledCount : 0;
      const revenuePerReferral = d.referralsCount > 0 ? d.revenueGenerated / d.referralsCount : 0;
      const commercialMixPct = d.totalPayerCount > 0 ? d.commercialCount / d.totalPayerCount : 0;
      let growthRate3mo = 0;
      if (i >= 3) {
        const threeMonthAgo = monthData[sortedMonths[i - 3]];
        const prevRefs = threeMonthAgo?.referralsCount || 0;
        if (prevRefs > 0) growthRate3mo = (d.referralsCount - prevRefs) / prevRefs;
      }
      summaryRows.push({
        physicianId: physId, month: m, referralsCount: d.referralsCount,
        scheduledCount: d.scheduledCount, evaluatedCount: d.evaluatedCount,
        arrivedCount: d.arrivedCount, arrivalRate,
        totalVisitsGenerated: d.totalVisitsGenerated,
        revenueGenerated: String(d.revenueGenerated.toFixed(2)),
        revenuePerReferral: String(revenuePerReferral.toFixed(2)),
        commercialMixPct, growthRate3mo, tierScore: 0, tierLabel: "D" as const,
      });
    }
  }

  const maxRevenue = Math.max(...summaryRows.map(r => parseFloat(r.revenueGenerated)), 1);
  const maxGrowth = Math.max(...summaryRows.map(r => Math.abs(r.growthRate3mo)), 0.01);
  const { revenueWeight, trendWeight, conversionWeight, payerMixWeight, tierAThreshold, tierBThreshold, tierCThreshold } = weights;

  for (const row of summaryRows) {
    const revNorm = parseFloat(row.revenueGenerated) / maxRevenue;
    const trendNorm = (row.growthRate3mo + maxGrowth) / (2 * maxGrowth);
    row.tierScore = (revenueWeight * revNorm) + (trendWeight * trendNorm) + (conversionWeight * row.arrivalRate) + (payerMixWeight * row.commercialMixPct);
    if (row.tierScore >= tierAThreshold) row.tierLabel = "A";
    else if (row.tierScore >= tierBThreshold) row.tierLabel = "B";
    else if (row.tierScore >= tierCThreshold) row.tierLabel = "C";
    else row.tierLabel = "D";
  }

  return summaryRows;
}

export async function upsertPhysicianSummaries(activeRows: any[]): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < activeRows.length; i += batchSize) {
    const batch = activeRows.slice(i, i + batchSize);
    for (const row of batch) {
      await db.insert(physicianMonthlySummary).values(row).onConflictDoUpdate({
        target: [physicianMonthlySummary.physicianId, physicianMonthlySummary.month],
        set: {
          referralsCount: sql`excluded.referrals_count`, scheduledCount: sql`excluded.scheduled_count`,
          evaluatedCount: sql`excluded.evaluated_count`, arrivedCount: sql`excluded.arrived_count`,
          arrivalRate: sql`excluded.arrival_rate`, totalVisitsGenerated: sql`excluded.total_visits_generated`,
          revenueGenerated: sql`excluded.revenue_generated`, revenuePerReferral: sql`excluded.revenue_per_referral`,
          commercialMixPct: sql`excluded.commercial_mix_pct`, growthRate3mo: sql`excluded.growth_rate_3mo`,
          tierScore: sql`excluded.tier_score`, tierLabel: sql`excluded.tier_label`, updatedAt: new Date(),
        },
      });
    }
  }
}

export async function upsertLocationSummaries(
  months: string[],
  allLocations: { id: string }[],
  allReferrals: any[],
  allCollections: any[]
): Promise<void> {
  for (const loc of allLocations) {
    for (const m of months) {
      const nextM = getNextMonth(m);
      const locReferrals = allReferrals.filter(r => r.locationId === loc.id && r.referralDate >= m && r.referralDate < nextM);
      const locCollections = allCollections.filter(c => c.locationId === loc.id && c.collectionDate >= m && c.collectionDate < nextM);
      const refCount = locReferrals.length;
      const totalVisits = locReferrals.reduce((sum, r) => sum + (r.arrivedVisits || 0), 0);
      const revenueTotal = locReferrals.reduce((sum, r) => sum + (r.valueEstimate || 0), 0) + locCollections.reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);
      if (refCount === 0 && revenueTotal === 0) continue;

      const physRefCounts: Record<string, number> = {};
      for (const r of locReferrals) { if (r.physicianId) physRefCounts[r.physicianId] = (physRefCounts[r.physicianId] || 0) + 1; }
      const sortedPhysCounts = Object.values(physRefCounts).sort((a, b) => b - a);
      const depRatio = refCount > 0 ? sortedPhysCounts.slice(0, 5).reduce((a, b) => a + b, 0) / refCount : 0;

      const prevMonth = new Date(m);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const prevM = getMonthStart(prevMonth);
      const prevRefs = allReferrals.filter(r => r.locationId === loc.id && r.referralDate >= prevM && r.referralDate < m).length;
      const declining = prevRefs > 0 && refCount < prevRefs;
      const riskScore = (depRatio * 0.6) + (declining ? 0.4 : 0);

      await db.insert(locationMonthlySummary).values({ locationId: loc.id, month: m, referralsCount: refCount, totalVisits, revenueTotal: String(revenueTotal.toFixed(2)), referralDependencyRatio: depRatio, riskScore })
        .onConflictDoUpdate({
          target: [locationMonthlySummary.locationId, locationMonthlySummary.month],
          set: { referralsCount: sql`excluded.referrals_count`, totalVisits: sql`excluded.total_visits`, revenueTotal: sql`excluded.revenue_total`, referralDependencyRatio: sql`excluded.referral_dependency_ratio`, riskScore: sql`excluded.risk_score`, updatedAt: new Date() },
        });
    }
  }
}

export async function upsertTerritorySummaries(
  months: string[],
  allTerritories: { id: string }[],
  allPhysicians: { id: string; territoryId: string | null }[],
  allReferrals: any[],
  allCollections: any[]
): Promise<void> {
  for (const terr of allTerritories) {
    const terrPhysIds = new Set(allPhysicians.filter(p => p.territoryId === terr.id).map(p => p.id));
    for (const m of months) {
      const nextM = getNextMonth(m);
      const terrRefs = allReferrals.filter(r => r.physicianId && terrPhysIds.has(r.physicianId) && r.referralDate >= m && r.referralDate < nextM);
      const terrCols = allCollections.filter(c => c.physicianId && terrPhysIds.has(c.physicianId) && c.collectionDate >= m && c.collectionDate < nextM);
      const refCount = terrRefs.length;
      const totalVisits = terrRefs.reduce((sum, r) => sum + (r.arrivedVisits || 0), 0);
      const revenueTotal = terrRefs.reduce((sum, r) => sum + (r.valueEstimate || 0), 0) + terrCols.reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);
      if (refCount === 0 && revenueTotal === 0) continue;

      await db.insert(territoryMonthlySummary).values({ territoryId: terr.id, month: m, referralsCount: refCount, totalVisits, revenueTotal: String(revenueTotal.toFixed(2)), revenuePerRep: String(revenueTotal.toFixed(2)), visitsPerRep: totalVisits })
        .onConflictDoUpdate({
          target: [territoryMonthlySummary.territoryId, territoryMonthlySummary.month],
          set: { referralsCount: sql`excluded.referrals_count`, totalVisits: sql`excluded.total_visits`, revenueTotal: sql`excluded.revenue_total`, revenuePerRep: sql`excluded.revenue_per_rep`, visitsPerRep: sql`excluded.visits_per_rep`, updatedAt: new Date() },
        });
    }
  }
}
