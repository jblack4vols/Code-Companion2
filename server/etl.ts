import cron from "node-cron";
import { db } from "./db";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import {
  physicians, referrals, collections, locations, territories,
  physicianMonthlySummary, territoryMonthlySummary, locationMonthlySummary,
  tieringWeights,
} from "@shared/schema";

function getMonthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthsBetween(startMonth: string, endMonth: string): string[] {
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

function getNextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export async function runETL() {
  console.log("[ETL] Starting monthly summary computation...");
  const startTime = Date.now();

  try {
    const now = new Date();
    const currentMonth = getMonthStart(now);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startMonth = getMonthStart(sixMonthsAgo);

    const months = getMonthsBetween(startMonth, currentMonth);
    console.log(`[ETL] Computing summaries for ${months.length} months: ${startMonth} to ${currentMonth}`);

    const allPhysicians = await db.select({ id: physicians.id, territoryId: physicians.territoryId }).from(physicians);
    const allLocations = await db.select({ id: locations.id }).from(locations);
    const allTerritories = await db.select({ id: territories.id }).from(territories);

    const allReferrals = await db.select().from(referrals)
      .where(gte(referrals.referralDate, startMonth));

    const allCollections = await db.select().from(collections)
      .where(gte(collections.collectionDate, startMonth));

    const [weights] = await db.select().from(tieringWeights);
    const revenueWeight = weights?.revenueWeight ?? 0.4;
    const trendWeight = weights?.trendWeight ?? 0.2;
    const conversionWeight = weights?.conversionWeight ?? 0.2;
    const payerMixWeight = weights?.payerMixWeight ?? 0.2;
    const tierAThreshold = weights?.tierAThreshold ?? 0.8;
    const tierBThreshold = weights?.tierBThreshold ?? 0.5;
    const tierCThreshold = weights?.tierCThreshold ?? 0.2;

    type PhysSummary = {
      referralsCount: number;
      scheduledCount: number;
      evaluatedCount: number;
      arrivedCount: number;
      totalVisitsGenerated: number;
      revenueGenerated: number;
      commercialCount: number;
      totalPayerCount: number;
    };

    const physicianMonthlyData: Record<string, Record<string, PhysSummary>> = {};

    for (const physId of allPhysicians.map(p => p.id)) {
      physicianMonthlyData[physId] = {};
      for (const m of months) {
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

      if (ref.scheduledVisits && ref.scheduledVisits > 0) {
        s.scheduledCount++;
      }
      if (ref.status === "EVAL_COMPLETED" || ref.status === "DISCHARGED") {
        s.evaluatedCount++;
      }
      if (ref.arrivedVisits && ref.arrivedVisits > 0) {
        s.arrivedCount++;
        s.totalVisitsGenerated += ref.arrivedVisits;
      }

      if (ref.valueEstimate) {
        s.revenueGenerated += ref.valueEstimate;
      }

      if (ref.primaryPayerType) {
        s.totalPayerCount++;
        const pt = ref.primaryPayerType.toLowerCase();
        if (pt.includes("commercial") || pt.includes("bcbs") || pt.includes("blue") || pt.includes("aetna") || pt.includes("cigna") || pt.includes("united")) {
          s.commercialCount++;
        }
      } else if (ref.payerType) {
        s.totalPayerCount++;
        if (ref.payerType === "COMMERCIAL") {
          s.commercialCount++;
        }
      }
    }

    for (const col of allCollections) {
      if (!col.physicianId) continue;
      const colMonth = col.collectionDate.slice(0, 7) + "-01";
      if (!physicianMonthlyData[col.physicianId]?.[colMonth]) continue;
      physicianMonthlyData[col.physicianId][colMonth].revenueGenerated += parseFloat(String(col.amount));
    }

    const summaryRows: any[] = [];
    for (const physId of Object.keys(physicianMonthlyData)) {
      const monthData = physicianMonthlyData[physId];
      const sortedMonths = Object.keys(monthData).sort();

      for (let i = 0; i < sortedMonths.length; i++) {
        const m = sortedMonths[i];
        const d = monthData[m];
        const arrivalRate = d.scheduledCount > 0 ? d.arrivedCount / d.scheduledCount : 0;
        const revenuePerReferral = d.referralsCount > 0 ? d.revenueGenerated / d.referralsCount : 0;
        const commercialMixPct = d.totalPayerCount > 0 ? d.commercialCount / d.totalPayerCount : 0;

        let growthRate3mo = 0;
        if (i >= 3) {
          const threeMonthAgo = monthData[sortedMonths[i - 3]];
          const prevRefs = threeMonthAgo?.referralsCount || 0;
          if (prevRefs > 0) {
            growthRate3mo = (d.referralsCount - prevRefs) / prevRefs;
          }
        }

        summaryRows.push({
          physicianId: physId,
          month: m,
          referralsCount: d.referralsCount,
          scheduledCount: d.scheduledCount,
          evaluatedCount: d.evaluatedCount,
          arrivedCount: d.arrivedCount,
          arrivalRate,
          totalVisitsGenerated: d.totalVisitsGenerated,
          revenueGenerated: String(d.revenueGenerated.toFixed(2)),
          revenuePerReferral: String(revenuePerReferral.toFixed(2)),
          commercialMixPct,
          growthRate3mo,
          tierScore: 0,
          tierLabel: "D" as const,
        });
      }
    }

    const maxRevenue = Math.max(...summaryRows.map(r => parseFloat(r.revenueGenerated)), 1);
    const maxGrowth = Math.max(...summaryRows.map(r => Math.abs(r.growthRate3mo)), 0.01);

    for (const row of summaryRows) {
      const revNorm = parseFloat(row.revenueGenerated) / maxRevenue;
      const trendNorm = (row.growthRate3mo + maxGrowth) / (2 * maxGrowth);
      const convNorm = row.arrivalRate;
      const payerNorm = row.commercialMixPct;

      row.tierScore = (revenueWeight * revNorm) + (trendWeight * trendNorm) +
                      (conversionWeight * convNorm) + (payerMixWeight * payerNorm);

      if (row.tierScore >= tierAThreshold) row.tierLabel = "A";
      else if (row.tierScore >= tierBThreshold) row.tierLabel = "B";
      else if (row.tierScore >= tierCThreshold) row.tierLabel = "C";
      else row.tierLabel = "D";
    }

    const activeRows = summaryRows.filter(r => r.referralsCount > 0 || parseFloat(r.revenueGenerated) > 0);
    console.log(`[ETL] Upserting ${activeRows.length} physician monthly summaries...`);

    const batchSize = 100;
    for (let i = 0; i < activeRows.length; i += batchSize) {
      const batch = activeRows.slice(i, i + batchSize);
      for (const row of batch) {
        await db.insert(physicianMonthlySummary)
          .values(row)
          .onConflictDoUpdate({
            target: [physicianMonthlySummary.physicianId, physicianMonthlySummary.month],
            set: {
              referralsCount: sql`excluded.referrals_count`,
              scheduledCount: sql`excluded.scheduled_count`,
              evaluatedCount: sql`excluded.evaluated_count`,
              arrivedCount: sql`excluded.arrived_count`,
              arrivalRate: sql`excluded.arrival_rate`,
              totalVisitsGenerated: sql`excluded.total_visits_generated`,
              revenueGenerated: sql`excluded.revenue_generated`,
              revenuePerReferral: sql`excluded.revenue_per_referral`,
              commercialMixPct: sql`excluded.commercial_mix_pct`,
              growthRate3mo: sql`excluded.growth_rate_3mo`,
              tierScore: sql`excluded.tier_score`,
              tierLabel: sql`excluded.tier_label`,
              updatedAt: new Date(),
            },
          });
      }
    }

    console.log("[ETL] Computing location monthly summaries...");
    for (const loc of allLocations) {
      for (const m of months) {
        const nextM = getNextMonth(m);
        const locReferrals = allReferrals.filter(
          r => r.locationId === loc.id && r.referralDate >= m && r.referralDate < nextM
        );
        const locCollections = allCollections.filter(
          c => c.locationId === loc.id && c.collectionDate >= m && c.collectionDate < nextM
        );

        const refCount = locReferrals.length;
        const totalVisits = locReferrals.reduce((sum, r) => sum + (r.arrivedVisits || 0), 0);
        const revFromRefs = locReferrals.reduce((sum, r) => sum + (r.valueEstimate || 0), 0);
        const revFromCols = locCollections.reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);
        const revenueTotal = revFromRefs + revFromCols;

        if (refCount === 0 && revenueTotal === 0) continue;

        const physRefCounts: Record<string, number> = {};
        for (const r of locReferrals) {
          if (r.physicianId) {
            physRefCounts[r.physicianId] = (physRefCounts[r.physicianId] || 0) + 1;
          }
        }
        const sortedPhysCounts = Object.values(physRefCounts).sort((a, b) => b - a);
        const top5Count = sortedPhysCounts.slice(0, 5).reduce((a, b) => a + b, 0);
        const depRatio = refCount > 0 ? top5Count / refCount : 0;

        const prevMonth = new Date(m);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        const prevM = getMonthStart(prevMonth);
        const prevRefs = allReferrals.filter(
          r => r.locationId === loc.id && r.referralDate >= prevM && r.referralDate < m
        ).length;
        const declining = prevRefs > 0 && refCount < prevRefs;
        const riskScore = (depRatio * 0.6) + (declining ? 0.4 : 0);

        await db.insert(locationMonthlySummary)
          .values({
            locationId: loc.id,
            month: m,
            referralsCount: refCount,
            totalVisits,
            revenueTotal: String(revenueTotal.toFixed(2)),
            referralDependencyRatio: depRatio,
            riskScore,
          })
          .onConflictDoUpdate({
            target: [locationMonthlySummary.locationId, locationMonthlySummary.month],
            set: {
              referralsCount: sql`excluded.referrals_count`,
              totalVisits: sql`excluded.total_visits`,
              revenueTotal: sql`excluded.revenue_total`,
              referralDependencyRatio: sql`excluded.referral_dependency_ratio`,
              riskScore: sql`excluded.risk_score`,
              updatedAt: new Date(),
            },
          });
      }
    }

    console.log("[ETL] Computing territory monthly summaries...");
    for (const terr of allTerritories) {
      const terrPhysicians = allPhysicians.filter(p => p.territoryId === terr.id);
      const terrPhysIds = new Set(terrPhysicians.map(p => p.id));

      for (const m of months) {
        const nextM = getNextMonth(m);
        const terrRefs = allReferrals.filter(
          r => r.physicianId && terrPhysIds.has(r.physicianId) && r.referralDate >= m && r.referralDate < nextM
        );
        const terrCols = allCollections.filter(
          c => c.physicianId && terrPhysIds.has(c.physicianId) && c.collectionDate >= m && c.collectionDate < nextM
        );

        const refCount = terrRefs.length;
        const totalVisits = terrRefs.reduce((sum, r) => sum + (r.arrivedVisits || 0), 0);
        const revFromRefs = terrRefs.reduce((sum, r) => sum + (r.valueEstimate || 0), 0);
        const revFromCols = terrCols.reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);
        const revenueTotal = revFromRefs + revFromCols;

        if (refCount === 0 && revenueTotal === 0) continue;

        await db.insert(territoryMonthlySummary)
          .values({
            territoryId: terr.id,
            month: m,
            referralsCount: refCount,
            totalVisits,
            revenueTotal: String(revenueTotal.toFixed(2)),
            revenuePerRep: String(revenueTotal.toFixed(2)),
            visitsPerRep: totalVisits,
          })
          .onConflictDoUpdate({
            target: [territoryMonthlySummary.territoryId, territoryMonthlySummary.month],
            set: {
              referralsCount: sql`excluded.referrals_count`,
              totalVisits: sql`excluded.total_visits`,
              revenueTotal: sql`excluded.revenue_total`,
              revenuePerRep: sql`excluded.revenue_per_rep`,
              visitsPerRep: sql`excluded.visits_per_rep`,
              updatedAt: new Date(),
            },
          });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ETL] Completed in ${elapsed}s. ${activeRows.length} physician summaries, ${allLocations.length} location summaries processed.`);
  } catch (err) {
    console.error("[ETL] Error during summary computation:", err);
  }
}

export function scheduleETL() {
  cron.schedule("0 2 * * *", async () => {
    console.log("[ETL] Nightly job triggered at", new Date().toISOString());
    await runETL();
  });
  console.log("[ETL] Nightly job scheduled for 2:00 AM daily");
}

export async function triggerETL() {
  await runETL();
}
