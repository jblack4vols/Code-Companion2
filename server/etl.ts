/**
 * ETL orchestrator — scheduling, incremental detection, and pipeline coordination.
 * Processing logic lives in:
 *   etl-summary-generation.ts  — physician/location/territory monthly rollups
 *   etl-data-enrichment.ts     — stage transitions + provider alert emails
 */
import cron, { type ScheduledTask } from "node-cron";
import { db } from "./db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import {
  physicians, referrals, collections, locations, territories,
  tieringWeights, appSettings, tasks, users, scheduledReports,
} from "@shared/schema";
import {
  sendOverdueTaskDigest, sendScheduledReportEmail, sendUserInactivityDigest,
} from "./outlook";
import { storage } from "./storage";
import {
  getMonthStart, getMonthsBetween,
  computePhysicianMonthlySummaries,
  upsertPhysicianSummaries,
  upsertLocationSummaries,
  upsertTerritorySummaries,
} from "./etl-summary-generation";
import { updateProviderStages, sendProviderAlerts } from "./etl-data-enrichment";

// ---- ETL run timestamp persistence ----

async function getLastETLRun(): Promise<Date | null> {
  const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "etl_last_run_at"));
  return setting?.value ? new Date(setting.value) : null;
}

async function setLastETLRun(timestamp: Date): Promise<void> {
  await db.insert(appSettings)
    .values({ key: "etl_last_run_at", value: timestamp.toISOString() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: timestamp.toISOString(), updatedAt: new Date() } });
}

async function getAffectedMonths(lastRun: Date, currentMonth: string): Promise<Set<string>> {
  const changedReferrals = await db.select({ referralDate: referrals.referralDate }).from(referrals).where(gte(referrals.updatedAt, lastRun));
  const changedCollections = await db.select({ collectionDate: collections.collectionDate }).from(collections).where(gte(collections.updatedAt, lastRun));
  const affected = new Set<string>([currentMonth]);
  for (const r of changedReferrals) { if (r.referralDate) affected.add(r.referralDate.slice(0, 7) + "-01"); }
  for (const c of changedCollections) { if (c.collectionDate) affected.add(c.collectionDate.slice(0, 7) + "-01"); }
  return affected;
}

// ---- Main ETL run ----

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

    const allPhysicians = await db.select({ id: physicians.id, territoryId: physicians.territoryId })
      .from(physicians).where(sql`${physicians.deletedAt} IS NULL`);
    const allLocations = await db.select({ id: locations.id }).from(locations);
    const allTerritories = await db.select({ id: territories.id }).from(territories);
    const allReferrals = await db.select().from(referrals)
      .where(and(gte(referrals.referralDate, startMonth), sql`${referrals.deletedAt} IS NULL`));
    const allCollections = await db.select().from(collections)
      .where(gte(collections.collectionDate, startMonth));

    const [w] = await db.select().from(tieringWeights);
    const weights = {
      revenueWeight: w?.revenueWeight ?? 0.4,
      trendWeight: w?.trendWeight ?? 0.2,
      conversionWeight: w?.conversionWeight ?? 0.2,
      payerMixWeight: w?.payerMixWeight ?? 0.2,
      tierAThreshold: w?.tierAThreshold ?? 0.8,
      tierBThreshold: w?.tierBThreshold ?? 0.5,
      tierCThreshold: w?.tierCThreshold ?? 0.2,
    };

    // Physician summaries
    const summaryRows = await computePhysicianMonthlySummaries(months, allMonths, allPhysicians, allReferrals, allCollections, weights);
    const activeRows = summaryRows.filter(r => r.referralsCount > 0 || parseFloat(r.revenueGenerated) > 0);
    console.log(`[ETL] Upserting ${activeRows.length} physician monthly summaries...`);
    await upsertPhysicianSummaries(activeRows);

    // Location + territory summaries
    console.log("[ETL] Computing location monthly summaries...");
    await upsertLocationSummaries(months, allLocations, allReferrals, allCollections);
    console.log("[ETL] Computing territory monthly summaries...");
    await upsertTerritorySummaries(months, allTerritories, allPhysicians, allReferrals, allCollections);

    // Stage transitions + alerts
    console.log("[ETL] Auto-updating provider relationship stages...");
    const stageTransitions = await updateProviderStages(allPhysicians, allReferrals, now);
    await sendProviderAlerts(stageTransitions, summaryRows, allReferrals, now);

    await setLastETLRun(runTimestamp);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ETL] Completed in ${elapsed}s. ${activeRows.length} physician summaries, ${allLocations.length} location summaries processed.`);
  } catch (err) {
    console.error("[ETL] Error during summary computation:", err);
  }
}

// ---- Overdue task digest ----

async function sendOverdueDigests() {
  console.log("[Email] Checking for overdue tasks...");
  try {
    const now = new Date();
    const overdueTasks = await db.select({
      id: tasks.id, description: tasks.description, dueAt: tasks.dueAt,
      assignedToUserId: tasks.assignedToUserId, physicianId: tasks.physicianId,
    }).from(tasks).where(and(eq(tasks.status, "OPEN"), lt(tasks.dueAt, now)));

    if (overdueTasks.length === 0) { console.log("[Email] No overdue tasks found."); return; }

    const byUser: Record<string, typeof overdueTasks> = {};
    for (const t of overdueTasks) {
      if (!t.assignedToUserId) continue;
      (byUser[t.assignedToUserId] ??= []).push(t);
    }

    const { physicians: physTable } = await import("@shared/schema");
    const physCache: Record<string, string> = {};
    for (const [userId, userTasks] of Object.entries(byUser)) {
      const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      if (!user?.email) continue;
      const formatted = await Promise.all(userTasks.map(async (t) => {
        let providerName: string | undefined;
        if (t.physicianId) {
          if (!physCache[t.physicianId]) {
            const p = await db.select({ firstName: physTable.firstName, lastName: physTable.lastName }).from(physTable).where(eq(physTable.id, t.physicianId)).then(r => r[0]);
            if (p) physCache[t.physicianId] = `${p.firstName} ${p.lastName}`;
          }
          providerName = physCache[t.physicianId];
        }
        return { title: t.description.slice(0, 100), dueDate: t.dueAt!.toISOString(), providerName };
      }));
      const appUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : "https://tristar360.replit.app";
      await sendOverdueTaskDigest(user.email, user.name, formatted, appUrl);
    }
    console.log(`[Email] Overdue digests sent to ${Object.keys(byUser).length} users`);
  } catch (err: any) {
    console.error("[Email] Error sending overdue digests:", err.message);
  }
}

// ---- Scheduled report delivery ----

async function processScheduledReports() {
  console.log("[Reports] Checking for scheduled reports due to run...");
  try {
    const now = new Date();
    const allReports = await db.select().from(scheduledReports).where(eq(scheduledReports.isActive, true));
    for (const report of allReports) {
      let shouldRun = false;
      if (!report.lastRunAt) shouldRun = true;
      else if (report.nextRunAt && report.nextRunAt <= now) shouldRun = true;
      else if (report.frequency === "weekly") shouldRun = (now.getTime() - report.lastRunAt.getTime()) / 86400000 >= 7;
      else if (report.frequency === "monthly") shouldRun = (now.getTime() - report.lastRunAt.getTime()) / 86400000 >= 28;
      if (!shouldRun) continue;

      console.log(`[Reports] Generating report: ${report.name} (${report.reportType})`);
      let csv = "";
      try {
        if (report.reportType === "referral_summary") {
          const data = await storage.exportReferralsCsv({});
          const headers = ["Referral Date", "Patient Name", "Account #", "Status", "Provider", "Location"];
          csv = [headers.join(","), ...data.map((r: any) => [r.referralDate, r.patientFullName, r.patientAccountNumber, r.status, `${r.physicianFirstName || ""} ${r.physicianLastName || ""}`.trim(), r.locationName].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
        } else if (report.reportType === "interaction_summary") {
          const data = await storage.exportInteractionsCsv({});
          const headers = ["Date", "Type", "Summary", "Provider", "User", "Location"];
          csv = [headers.join(","), ...data.map((r: any) => [r.occurredAt ? new Date(r.occurredAt).toISOString().slice(0, 10) : "", r.type, r.summary, `${r.physicianFirstName || ""} ${r.physicianLastName || ""}`.trim(), r.userName, r.locationName].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
        } else if (report.reportType === "provider_pipeline") {
          const data = await storage.exportPhysiciansCsv({});
          const headers = ["Name", "Credentials", "NPI", "Practice", "City", "Status", "Stage"];
          csv = [headers.join(","), ...data.map((r: any) => [`${r.firstName} ${r.lastName}`, r.credentials, r.npi, r.practiceName, r.city, r.status, r.relationshipStage].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","))].join("\n");
        } else { continue; }

        const recipients = report.recipients.split(",").map((e: string) => e.trim()).filter(Boolean);
        const appUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://tristar360.replit.app";
        for (const email of recipients) {
          await sendScheduledReportEmail(email, email.split("@")[0], report.name, report.reportType, csv, appUrl);
        }
        const nextRun = new Date(now);
        if (report.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
        else if (report.frequency === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
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

// ---- User inactivity digest ----

async function checkUserInactivity() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const allUsers = await db.select().from(users).where(and(eq(users.approvalStatus, "APPROVED"), sql`${users.lockedUntil} IS NULL`));
    const inactiveUsers = allUsers.filter(u => !u.lastLoginAt || new Date(u.lastLoginAt) < sevenDaysAgo);
    if (inactiveUsers.length === 0) { console.log("[Inactivity] No inactive users found"); return; }

    const admins = allUsers.filter(u => u.role === "OWNER" || u.role === "DIRECTOR");
    const appUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "https://tristar360.replit.app";
    const inactiveData = inactiveUsers.map(u => ({
      name: u.name || u.email, role: u.role || "Unknown",
      lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never",
      daysSince: u.lastLoginAt ? Math.floor((Date.now() - new Date(u.lastLoginAt).getTime()) / 86400000) : 999,
    }));
    for (const admin of admins) {
      if (admin.email) await sendUserInactivityDigest(admin.email, admin.name || "Admin", inactiveData, appUrl);
    }
    console.log(`[Inactivity] Sent digest for ${inactiveUsers.length} inactive users to ${admins.length} admins`);
  } catch (err: any) {
    console.error("[Inactivity] Error checking user inactivity:", err.message);
  }
}

// ---- Schedule helpers ----

async function getScheduleSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return result[0]?.value || defaultValue;
  } catch { return defaultValue; }
}

let etlTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;
let reportTask: ScheduledTask | null = null;
let inactivityTask: ScheduledTask | null = null;

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

  console.log(`[ETL] Nightly ETL scheduled for ${etlTime} daily`);
  console.log(`[Email] Overdue task digest scheduled for ${digestTime} weekdays`);
  console.log(`[Reports] Scheduled report delivery check at ${reportTime} daily`);
  console.log("[Inactivity] User inactivity check scheduled for 8:00 AM Mondays");
}

export async function triggerETL() { await runETL(); }
export async function triggerFullETL() { await runETL(true); }
