/**
 * ETL data enrichment — physician stage transitions + provider alert emails.
 * Called by etl.ts orchestrator after summary computation.
 */
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import {
  physicians, referrals, physicianStageHistory, users,
} from "@shared/schema";
import { sendProviderAlertEmail } from "./outlook";
import { getMonthStart } from "./etl-summary-generation";

export async function updateProviderStages(
  allPhysicians: { id: string; territoryId: string | null }[],
  allReferrals: any[],
  now: Date
): Promise<Array<{ physId: string; oldStage: string; newStage: string }>> {
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);
  const oneEightyDaysAgo = new Date(now);
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);
  const oneEightyDaysAgoStr = oneEightyDaysAgo.toISOString().slice(0, 10);

  const currentPhysData = await db.select({
    id: physicians.id, firstName: physicians.firstName,
    lastName: physicians.lastName, relationshipStage: physicians.relationshipStage,
  }).from(physicians).where(sql`${physicians.deletedAt} IS NULL`);

  const physStageMap = new Map(currentPhysData.map(p => [p.id, p.relationshipStage]));
  const stageTransitions: Array<{ physId: string; oldStage: string; newStage: string }> = [];
  let stageUpdates = 0;

  for (const phys of allPhysicians) {
    const physRefs = allReferrals.filter(r => r.physicianId === phys.id);
    const recentRefs = physRefs.filter(r => r.referralDate >= ninetyDaysAgoStr);
    const midRefs = physRefs.filter(r => r.referralDate >= oneEightyDaysAgoStr && r.referralDate < ninetyDaysAgoStr);
    const hasAnyRefs = physRefs.length > 0;
    const hasRecentRefs = recentRefs.length > 0;
    const hasMidRefs = midRefs.length > 0;

    let newStage: "NEW" | "ACTIVE" | "AT_RISK" | "INACTIVE" | null = null;
    if (hasRecentRefs) newStage = "ACTIVE";
    else if (hasMidRefs && !hasRecentRefs) newStage = "AT_RISK";
    else if (hasAnyRefs && !hasRecentRefs && !hasMidRefs) newStage = "INACTIVE";

    if (newStage) {
      const oldStage = physStageMap.get(phys.id) || "NEW";
      if (oldStage !== newStage) {
        stageTransitions.push({ physId: phys.id, oldStage, newStage });
        await db.insert(physicianStageHistory).values({
          physicianId: phys.id,
          previousStage: oldStage,
          newStage,
          reason: "Automated ETL stage transition",
        });
      }
      await db.update(physicians).set({
        relationshipStage: newStage as any,
        status: newStage === "ACTIVE" ? "ACTIVE" : (newStage === "INACTIVE" ? "INACTIVE" : "PROSPECT"),
        updatedAt: new Date(),
      }).where(eq(physicians.id, phys.id));
      stageUpdates++;
    }
  }

  console.log(`[ETL] Updated ${stageUpdates} provider stages (${stageTransitions.length} actual transitions)`);
  return stageTransitions;
}

export async function sendProviderAlerts(
  stageTransitions: Array<{ physId: string; oldStage: string; newStage: string }>,
  summaryRows: any[],
  allReferrals: any[],
  now: Date
): Promise<void> {
  try {
    const physNameMap = new Map(
      (await db.select({ id: physicians.id, firstName: physicians.firstName, lastName: physicians.lastName })
        .from(physicians).where(sql`${physicians.deletedAt} IS NULL`))
        .map(p => [p.id, `Dr. ${p.firstName} ${p.lastName}`])
    );

    const providerAlerts: Array<{ providerName: string; alertType: "declining" | "reactivated"; detail: string }> = [];

    // Reactivated providers
    for (const t of stageTransitions) {
      if ((t.oldStage === "INACTIVE" || t.oldStage === "AT_RISK") && t.newStage === "ACTIVE") {
        const latestRef = allReferrals.filter(r => r.physicianId === t.physId).sort((a: any, b: any) => b.referralDate.localeCompare(a.referralDate))[0];
        providerAlerts.push({
          providerName: physNameMap.get(t.physId) || "Unknown",
          alertType: "reactivated",
          detail: `Moved from ${t.oldStage} to ACTIVE${latestRef ? ` — latest referral: ${latestRef.referralDate}` : ""}`,
        });
      }
    }

    // Declining top providers
    const prevMonthStr = getMonthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const twoMonthsAgoStr = getMonthStart(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const topProviderSummaries = summaryRows.filter(r => r.month === prevMonthStr && (r.tierLabel === "A" || r.tierLabel === "B"));
    for (const curr of topProviderSummaries) {
      const prev = summaryRows.find(r => r.physicianId === curr.physicianId && r.month === twoMonthsAgoStr);
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

    if (providerAlerts.length === 0) return;

    const ownerUsers = await db.select().from(users).where(eq(users.role, "OWNER"));
    const directorUsers = await db.select().from(users).where(eq(users.role, "DIRECTOR"));
    const recipients = [...ownerUsers, ...directorUsers].filter(u => u.email);
    const appUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://tristar360.replit.app";

    for (const user of recipients) {
      if (user.email) await sendProviderAlertEmail(user.email, user.name, providerAlerts, appUrl);
    }
    console.log(`[ETL] Sent ${providerAlerts.length} provider alerts to ${recipients.length} recipients`);
  } catch (alertErr: any) {
    console.error("[ETL] Error sending provider alerts:", alertErr.message);
  }
}
