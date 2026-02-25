import cron from "node-cron";
import { db } from "./db";
import { eq, and, gte, lte, lt, sql, asc, or, isNull } from "drizzle-orm";
import {
  physicians, referrals, collections, locations, territories,
  physicianMonthlySummary, territoryMonthlySummary, locationMonthlySummary,
  tieringWeights, appSettings, tasks, users, scheduledReports,
  physicianStageHistory,
} from "@shared/schema";
import { sendOverdueTaskDigest, sendScheduledReportEmail, sendProviderAlertEmail, sendUserInactivityDigest } from "./outlook";
import { storage } from "./storage";

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

async function getLastETLRun(): Promise<Date | null> {
  const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "etl_last_run_at"));
  if (setting?.value) {
    return new Date(setting.value);
  }
  return null;
}

async function setLastETLRun(timestamp: Date): Promise<void> {
  await db.insert(appSettings)
    .values({ key: "etl_last_run_at", value: timestamp.toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: timestamp.toISOString(), updatedAt: new Date() },
    });
}

async function getAffectedMonths(lastRun: Date, currentMonth: string): Promise<Set<string>> {
  const changedReferrals = await db.select({ referralDate: referrals.referralDate })
    .from(referrals)
    .where(gte(referrals.updatedAt, lastRun));

  const changedCollections = await db.select({ collectionDate: collections.collectionDate })
    .from(collections)
    .where(gte(collections.updatedAt, lastRun));

  const affectedMonths = new Set<string>();

  affectedMonths.add(currentMonth);

  for (const r of changedReferrals) {
    if (r.referralDate) {
      affectedMonths.add(r.referralDate.slice(0, 7) + "-01");
    }
  }
  for (const c of changedCollections) {
    if (c.collectionDate) {
      affectedMonths.add(c.collectionDate.slice(0, 7) + "-01");
    }
  }

  return affectedMonths;
}

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

export async function runETL(forceFullRecompute = false) {
  console.log("[ETL] Starting monthly summary computation...");
  const startTime = Date.now();
  const runTimestamp = new Date();

  try {
    const now = new Date();
    const currentMonth = getMonthStart(now);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startMonth = getMonthStart(sixMonthsAgo);
    const allMonths = getMonthsBetween(startMonth, currentMonth);

    let months: string[];
    const lastRun = forceFullRecompute ? null : await getLastETLRun();

    if (lastRun) {
      const affected = await getAffectedMonths(lastRun, currentMonth);
      months = allMonths.filter(m => affected.has(m));
      if (months.length === 0) {
        console.log("[ETL] No changes detected since last run. Skipping.");
        await setLastETLRun(runTimestamp);
        return;
      }
      console.log(`[ETL] Incremental mode: ${months.length} of ${allMonths.length} months need recomputation`);
    } else {
      months = allMonths;
      console.log(`[ETL] Full recompute: ${months.length} months (${startMonth} to ${currentMonth})`);
    }

    const allPhysicians = await db.select({ id: physicians.id, territoryId: physicians.territoryId }).from(physicians)
      .where(sql`${physicians.deletedAt} IS NULL`);
    const allLocations = await db.select({ id: locations.id }).from(locations);
    const allTerritories = await db.select({ id: territories.id }).from(territories);

    const allReferrals = await db.select().from(referrals)
      .where(and(gte(referrals.referralDate, startMonth), sql`${referrals.deletedAt} IS NULL`));

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

    const summaryRows: Array<{
      physicianId: string;
      month: string;
      referralsCount: number;
      scheduledCount: number;
      evaluatedCount: number;
      arrivedCount: number;
      arrivalRate: number;
      totalVisitsGenerated: number;
      revenueGenerated: string;
      revenuePerReferral: string;
      commercialMixPct: number;
      growthRate3mo: number;
      tierScore: number;
      tierLabel: "A" | "B" | "C" | "D";
    }> = [];

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

    console.log("[ETL] Auto-updating provider relationship stages...");
    let stageUpdates = 0;
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(ninetyDaysAgo.getDate()).padStart(2, "0")}`;
    const oneEightyDaysAgo = new Date(now);
    oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);
    const oneEightyDaysAgoStr = `${oneEightyDaysAgo.getFullYear()}-${String(oneEightyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(oneEightyDaysAgo.getDate()).padStart(2, "0")}`;

    const currentPhysData = await db.select({
      id: physicians.id,
      firstName: physicians.firstName,
      lastName: physicians.lastName,
      relationshipStage: physicians.relationshipStage,
    }).from(physicians).where(sql`${physicians.deletedAt} IS NULL`);
    const physStageMap = new Map(currentPhysData.map(p => [p.id, p.relationshipStage]));
    const physNameMap = new Map(currentPhysData.map(p => [p.id, `Dr. ${p.firstName} ${p.lastName}`]));

    const stageTransitions: Array<{ physId: string; oldStage: string; newStage: string }> = [];

    for (const phys of allPhysicians) {
      const physRefs = allReferrals.filter(r => r.physicianId === phys.id);
      const recentRefs = physRefs.filter(r => r.referralDate >= ninetyDaysAgoStr);
      const midRefs = physRefs.filter(r => r.referralDate >= oneEightyDaysAgoStr && r.referralDate < ninetyDaysAgoStr);
      const hasAnyRefs = physRefs.length > 0;
      const hasRecentRefs = recentRefs.length > 0;
      const hasMidRefs = midRefs.length > 0;

      let newStage: "NEW" | "ACTIVE" | "AT_RISK" | "INACTIVE" | null = null;

      if (hasRecentRefs) {
        newStage = "ACTIVE";
      } else if (hasMidRefs && !hasRecentRefs) {
        newStage = "AT_RISK";
      } else if (hasAnyRefs && !hasRecentRefs && !hasMidRefs) {
        newStage = "INACTIVE";
      }

      if (newStage) {
        const oldStage = physStageMap.get(phys.id) || "NEW";
        if (oldStage !== newStage) {
          stageTransitions.push({ physId: phys.id, oldStage, newStage });
          await db.insert(physicianStageHistory).values({
            physicianId: phys.id,
            previousStage: oldStage,
            newStage: newStage,
            reason: "Automated ETL stage transition",
          });
        }
        await db.update(physicians).set({
          relationshipStage: newStage,
          status: newStage === "ACTIVE" ? "ACTIVE" : (newStage === "INACTIVE" ? "INACTIVE" : "PROSPECT"),
          updatedAt: new Date(),
        }).where(eq(physicians.id, phys.id));
        stageUpdates++;
      }
    }
    console.log(`[ETL] Updated ${stageUpdates} provider stages (${stageTransitions.length} actual transitions)`);

    try {
      const providerAlerts: Array<{ providerName: string; alertType: "declining" | "reactivated"; detail: string }> = [];

      for (const t of stageTransitions) {
        if ((t.oldStage === "INACTIVE" || t.oldStage === "AT_RISK") && t.newStage === "ACTIVE") {
          const latestRef = allReferrals.filter(r => r.physicianId === t.physId).sort((a, b) => b.referralDate.localeCompare(a.referralDate))[0];
          providerAlerts.push({
            providerName: physNameMap.get(t.physId) || "Unknown",
            alertType: "reactivated",
            detail: `Moved from ${t.oldStage} to ACTIVE${latestRef ? ` — latest referral: ${latestRef.referralDate}` : ""}`,
          });
        }
      }

      const prevMonthForAlerts = new Date(now);
      prevMonthForAlerts.setMonth(prevMonthForAlerts.getMonth() - 1);
      const prevMonthAlertStr = getMonthStart(prevMonthForAlerts);
      const twoMonthsAgoForAlerts = new Date(now);
      twoMonthsAgoForAlerts.setMonth(twoMonthsAgoForAlerts.getMonth() - 2);
      const twoMonthsAgoAlertStr = getMonthStart(twoMonthsAgoForAlerts);

      const topProviderSummaries = summaryRows.filter(r => r.month === prevMonthAlertStr && (r.tierLabel === "A" || r.tierLabel === "B"));
      for (const curr of topProviderSummaries) {
        const prev = summaryRows.find(r => r.physicianId === curr.physicianId && r.month === twoMonthsAgoAlertStr);
        if (prev && prev.referralsCount > 0) {
          const decline = (prev.referralsCount - curr.referralsCount) / prev.referralsCount;
          if (decline >= 0.3 && curr.referralsCount < prev.referralsCount) {
            providerAlerts.push({
              providerName: physNameMap.get(curr.physicianId) || "Unknown",
              alertType: "declining",
              detail: `Referrals dropped from ${prev.referralsCount} to ${curr.referralsCount} (${Math.round(decline * 100)}% decline)`,
            });
          }
        }
      }

      if (providerAlerts.length > 0) {
        const ownerUsers = await db.select().from(users).where(eq(users.role, "OWNER"));
        const directorUsers = await db.select().from(users).where(eq(users.role, "DIRECTOR"));
        const recipients = [...ownerUsers, ...directorUsers].filter(u => u.email);
        const appUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'https://tristar360.replit.app';
        for (const user of recipients) {
          if (user.email) {
            await sendProviderAlertEmail(user.email, user.name, providerAlerts, appUrl);
          }
        }
        console.log(`[ETL] Sent ${providerAlerts.length} provider alerts to ${recipients.length} recipients`);
      }
    } catch (alertErr: any) {
      console.error("[ETL] Error sending provider alerts:", alertErr.message);
    }

    await setLastETLRun(runTimestamp);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ETL] Completed in ${elapsed}s. ${activeRows.length} physician summaries, ${allLocations.length} location summaries processed.`);
  } catch (err) {
    console.error("[ETL] Error during summary computation:", err);
  }
}

async function sendOverdueDigests() {
  console.log("[Email] Checking for overdue tasks...");
  try {
    const now = new Date();
    const overdueTasks = await db.select({
      id: tasks.id,
      description: tasks.description,
      dueAt: tasks.dueAt,
      assignedToUserId: tasks.assignedToUserId,
      physicianId: tasks.physicianId,
    }).from(tasks).where(and(
      eq(tasks.status, "OPEN"),
      lt(tasks.dueAt, now)
    ));

    if (overdueTasks.length === 0) {
      console.log("[Email] No overdue tasks found.");
      return;
    }

    const byUser: Record<string, typeof overdueTasks> = {};
    for (const t of overdueTasks) {
      if (!t.assignedToUserId) continue;
      (byUser[t.assignedToUserId] ??= []).push(t);
    }

    const physCache: Record<string, string> = {};
    for (const [userId, userTasks] of Object.entries(byUser)) {
      const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      if (!user?.email) continue;

      const formatted = await Promise.all(userTasks.map(async (t) => {
        let providerName: string | undefined;
        if (t.physicianId) {
          if (!physCache[t.physicianId]) {
            const p = await db.select({ firstName: physicians.firstName, lastName: physicians.lastName }).from(physicians).where(eq(physicians.id, t.physicianId)).then(r => r[0]);
            if (p) physCache[t.physicianId] = `${p.firstName} ${p.lastName}`;
          }
          providerName = physCache[t.physicianId];
        }
        return { title: t.description.slice(0, 100), dueDate: t.dueAt!.toISOString(), providerName };
      }));

      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPL_SLUG
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'https://tristar360.replit.app';

      await sendOverdueTaskDigest(user.email, user.name, formatted, appUrl);
    }
    console.log(`[Email] Overdue digests sent to ${Object.keys(byUser).length} users`);
  } catch (err: any) {
    console.error("[Email] Error sending overdue digests:", err.message);
  }
}

async function processScheduledReports() {
  console.log("[Reports] Checking for scheduled reports due to run...");
  try {
    const now = new Date();
    const allReports = await db.select().from(scheduledReports).where(eq(scheduledReports.isActive, true));
    
    for (const report of allReports) {
      let shouldRun = false;
      if (!report.lastRunAt) {
        shouldRun = true;
      } else if (report.nextRunAt && report.nextRunAt <= now) {
        shouldRun = true;
      } else if (report.frequency === 'weekly') {
        const daysSince = (now.getTime() - report.lastRunAt.getTime()) / (1000 * 60 * 60 * 24);
        shouldRun = daysSince >= 7;
      } else if (report.frequency === 'monthly') {
        const daysSince = (now.getTime() - report.lastRunAt.getTime()) / (1000 * 60 * 60 * 24);
        shouldRun = daysSince >= 28;
      }

      if (!shouldRun) continue;

      console.log(`[Reports] Generating report: ${report.name} (${report.reportType})`);
      let csv = "";
      const dateStr = now.toISOString().slice(0, 10);

      try {
        if (report.reportType === "referral_summary") {
          const data = await storage.exportReferralsCsv({});
          const headers = ["Referral Date","Patient Name","Account #","Status","Provider","Location"];
          csv = [headers.join(","), ...data.map((r: any) =>
            [r.referralDate, r.patientFullName, r.patientAccountNumber, r.status, `${r.physicianFirstName || ''} ${r.physicianLastName || ''}`.trim(), r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
          )].join("\n");
        } else if (report.reportType === "interaction_summary") {
          const data = await storage.exportInteractionsCsv({});
          const headers = ["Date","Type","Summary","Provider","User","Location"];
          csv = [headers.join(","), ...data.map((r: any) =>
            [r.occurredAt ? new Date(r.occurredAt).toISOString().slice(0,10) : '', r.type, r.summary, `${r.physicianFirstName || ''} ${r.physicianLastName || ''}`.trim(), r.userName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
          )].join("\n");
        } else if (report.reportType === "provider_pipeline") {
          const data = await storage.exportPhysiciansCsv({});
          const headers = ["Name","Credentials","NPI","Practice","City","Status","Stage"];
          csv = [headers.join(","), ...data.map((r: any) =>
            [`${r.firstName} ${r.lastName}`, r.credentials, r.npi, r.practiceName, r.city, r.status, r.relationshipStage].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
          )].join("\n");
        } else {
          continue;
        }

        const recipients = report.recipients.split(',').map((e: string) => e.trim()).filter(Boolean);
        const appUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'https://tristar360.replit.app';

        for (const email of recipients) {
          await sendScheduledReportEmail(email, email.split('@')[0], report.name, report.reportType, csv, appUrl);
        }

        const nextRun = new Date(now);
        if (report.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
        else if (report.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

        await db.update(scheduledReports).set({ lastRunAt: now, nextRunAt: nextRun }).where(eq(scheduledReports.id, report.id));
        console.log(`[Reports] Sent "${report.name}" to ${recipients.length} recipients`);
      } catch (reportErr: any) {
        console.error(`[Reports] Error generating report ${report.name}: ${reportErr.message}`);
      }
    }
  } catch (err: any) {
    console.error("[Reports] Error processing scheduled reports:", err.message);
  }
}

async function checkUserInactivity() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const allUsers = await db.select().from(users).where(
      and(
        eq(users.approvalStatus, "APPROVED"),
        isNull(users.lockedUntil)
      )
    );

    const inactiveUsers = allUsers.filter(u => {
      if (!u.lastLoginAt) return true;
      return new Date(u.lastLoginAt) < sevenDaysAgo;
    });

    if (inactiveUsers.length === 0) {
      console.log("[Inactivity] No inactive users found");
      return;
    }

    const admins = allUsers.filter(u => u.role === "OWNER" || u.role === "DIRECTOR");
    const appUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "https://tristar360.replit.app";

    const inactiveData = inactiveUsers.map(u => ({
      name: u.name || u.email,
      role: u.role || "Unknown",
      lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never",
      daysSince: u.lastLoginAt
        ? Math.floor((Date.now() - new Date(u.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999,
    }));

    for (const admin of admins) {
      if (admin.email) {
        await sendUserInactivityDigest(admin.email, admin.name || "Admin", inactiveData, appUrl);
      }
    }
    console.log(`[Inactivity] Sent digest for ${inactiveUsers.length} inactive users to ${admins.length} admins`);
  } catch (err: any) {
    console.error("[Inactivity] Error checking user inactivity:", err.message);
  }
}

async function getScheduleSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return result[0]?.value || defaultValue;
  } catch {
    return defaultValue;
  }
}

let etlTask: cron.ScheduledTask | null = null;
let digestTask: cron.ScheduledTask | null = null;
let reportTask: cron.ScheduledTask | null = null;
let inactivityTask: cron.ScheduledTask | null = null;

export async function scheduleETL() {
  const etlTime = await getScheduleSetting("etl_schedule_time", "2:00");
  const digestTime = await getScheduleSetting("digest_schedule_time", "7:00");
  const reportTime = await getScheduleSetting("report_schedule_time", "6:30");

  const [etlH, etlM] = etlTime.split(":").map(Number);
  const [digH, digM] = digestTime.split(":").map(Number);
  const [repH, repM] = reportTime.split(":").map(Number);

  if (etlTask) etlTask.stop();
  if (digestTask) digestTask.stop();
  if (reportTask) reportTask.stop();
  if (inactivityTask) inactivityTask.stop();

  etlTask = cron.schedule(`${etlM} ${etlH} * * *`, async () => {
    console.log("[ETL] Nightly job triggered at", new Date().toISOString());
    await runETL();
  });

  digestTask = cron.schedule(`${digM} ${digH} * * 1-5`, async () => {
    console.log("[Email] Morning overdue digest triggered at", new Date().toISOString());
    await sendOverdueDigests();
  });

  reportTask = cron.schedule(`${repM} ${repH} * * *`, async () => {
    console.log("[Reports] Scheduled report check triggered at", new Date().toISOString());
    await processScheduledReports();
  });

  inactivityTask = cron.schedule("0 8 * * 1", async () => {
    console.log("[Inactivity] Weekly user inactivity check triggered at", new Date().toISOString());
    await checkUserInactivity();
  });

  console.log(`[ETL] Nightly ETL scheduled for ${etlTime} daily (includes provider stage updates and alerts)`);
  console.log(`[Email] Overdue task digest scheduled for ${digestTime} weekdays`);
  console.log(`[Reports] Scheduled report delivery check at ${reportTime} daily`);
  console.log("[Inactivity] User inactivity check scheduled for 8:00 AM Mondays");
}

export async function triggerETL() {
  await runETL();
}

export async function triggerFullETL() {
  await runETL(true);
}
