/**
 * Dashboard stats + analytics query storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, desc, asc, and, or, ilike, isNull, isNotNull, gte, lte, inArray, sql } from "drizzle-orm";
import {
  physicians, referrals, interactions, tasks, auditLogs, users,
  physicianMonthlySummary, locationMonthlySummary, tieringWeights,
  collections, scheduledReports,
  type AuditLog,
  type TieringWeights, type InsertScheduledReport, type ScheduledReport,
  type Collection, type InsertCollection,
} from "@shared/schema";
import type { PhysicianFilters, ReferralFilters } from "./storage";

export async function getAuditLogs(filters?: { userId?: string; entity?: string; action?: string; limit?: number }): Promise<AuditLog[]> {
  const conditions = [];
  if (filters?.userId) conditions.push(eq(auditLogs.userId, filters.userId));
  if (filters?.entity) conditions.push(eq(auditLogs.entity, filters.entity));
  if (filters?.action) conditions.push(eq(auditLogs.action, filters.action));
  const limit = filters?.limit || 200;
  if (conditions.length > 0) {
    return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.timestamp)).limit(limit);
  }
  return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit);
}

export async function createAuditLog(
  log: Omit<AuditLog, "id" | "timestamp" | "ipAddress" | "userAgent"> & { ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  await db.insert(auditLogs).values(log);
}

export async function exportAuditLogsCsv(filters?: { entity?: string; action?: string }): Promise<any[]> {
  const conditions: any[] = [];
  if (filters?.entity && filters.entity !== "all") conditions.push(eq(auditLogs.entity, filters.entity));
  if (filters?.action && filters.action !== "all") conditions.push(eq(auditLogs.action, filters.action));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select({
    timestamp: auditLogs.timestamp, userName: users.name, action: auditLogs.action,
    entity: auditLogs.entity, entityId: auditLogs.entityId, ipAddress: auditLogs.ipAddress,
    detailJson: auditLogs.detailJson,
  })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(where)
    .orderBy(desc(auditLogs.timestamp))
    .limit(5000);
}

export async function getDashboardStats(filters?: {
  startDate?: string; endDate?: string; locationId?: string; territoryId?: string; physicianId?: string;
}): Promise<any> {
  const refConditions: any[] = [];
  const interConditions: any[] = [];
  const physConditions: any[] = [];

  if (filters?.startDate) {
    refConditions.push(gte(referrals.referralDate, filters.startDate));
    interConditions.push(gte(interactions.occurredAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    refConditions.push(lte(referrals.referralDate, filters.endDate));
    interConditions.push(lte(interactions.occurredAt, new Date(filters.endDate)));
  }
  if (filters?.locationId) {
    refConditions.push(eq(referrals.locationId, filters.locationId));
    interConditions.push(eq(interactions.locationId, filters.locationId));
  }
  if (filters?.territoryId) {
    physConditions.push(eq(physicians.territoryId, filters.territoryId));
    refConditions.push(sql`${referrals.physicianId} IN (SELECT id FROM physicians WHERE territory_id = ${filters.territoryId} AND deleted_at IS NULL)`);
    interConditions.push(sql`${interactions.physicianId} IN (SELECT id FROM physicians WHERE territory_id = ${filters.territoryId} AND deleted_at IS NULL)`);
  }
  if (filters?.physicianId) {
    refConditions.push(eq(referrals.physicianId, filters.physicianId));
    interConditions.push(eq(interactions.physicianId, filters.physicianId));
    physConditions.push(eq(physicians.id, filters.physicianId));
  }
  refConditions.push(isNull(referrals.deletedAt));
  interConditions.push(isNull(interactions.deletedAt));

  const [refCountResult] = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(and(...refConditions));
  const [interCountResult] = await db.select({ count: sql<number>`count(*)` }).from(interactions).where(and(...interConditions));

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

  const activePhysConditions: any[] = [
    isNull(referrals.deletedAt), isNotNull(referrals.physicianId), gte(referrals.referralDate, ninetyDaysAgoStr),
  ];
  if (filters?.locationId) activePhysConditions.push(eq(referrals.locationId, filters.locationId));
  if (filters?.territoryId) activePhysConditions.push(sql`${referrals.physicianId} IN (SELECT id FROM physicians WHERE territory_id = ${filters.territoryId} AND deleted_at IS NULL)`);
  if (filters?.physicianId) activePhysConditions.push(eq(referrals.physicianId, filters.physicianId));

  const [activePhysicians] = await db.select({ count: sql<number>`count(DISTINCT ${referrals.physicianId})` })
    .from(referrals).where(and(...activePhysConditions));

  const atRiskPhysicians = await db.select({ count: sql<number>`count(*)` }).from(physicians)
    .where(physConditions.length > 0
      ? and(isNull(physicians.deletedAt), eq(physicians.relationshipStage, "AT_RISK"), ...physConditions)
      : and(isNull(physicians.deletedAt), eq(physicians.relationshipStage, "AT_RISK")));

  const refByMonth = await db.select({
    month: sql<string>`to_char(referral_date::date, 'YYYY-MM')`,
    count: sql<number>`count(*)`,
  }).from(referrals)
    .where(and(...refConditions))
    .groupBy(sql`to_char(referral_date::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(referral_date::date, 'YYYY-MM')`);

  const topReferrers = await db.select({
    physicianId: referrals.physicianId,
    count: sql<number>`count(*)`,
  }).from(referrals).where(and(...refConditions)).groupBy(referrals.physicianId).orderBy(desc(sql`count(*)`)).limit(5);

  const openTasks = await db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.status, "OPEN"));

  const [conversionResult] = await db.select({
    totalReceived: sql<number>`count(*)`,
    totalArrived: sql<number>`count(*) FILTER (WHERE ${referrals.arrivedVisits} > 0)`,
  }).from(referrals).where(and(...refConditions));

  const [avgTimeResult] = await db.select({
    avgDays: sql<number>`avg(CASE WHEN ${referrals.dateOfFirstArrivedVisit} IS NOT NULL AND ${referrals.referralDate} IS NOT NULL THEN (${referrals.dateOfFirstArrivedVisit}::date - ${referrals.referralDate}::date) ELSE NULL END)`,
  }).from(referrals).where(and(...refConditions));

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthDate = new Date(now);
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const momData = refByMonth.map(r => ({ month: r.month, count: Number(r.count) }));
  const curMonthCount = momData.find(d => d.month === currentMonthStr)?.count || 0;
  const prevMonthCount = momData.find(d => d.month === prevMonthStr)?.count || 0;
  const momGrowth = prevMonthCount > 0 ? ((curMonthCount - prevMonthCount) / prevMonthCount * 100) : (curMonthCount > 0 ? 100 : 0);

  const totalReceived = Number(conversionResult?.totalReceived || 0);
  const totalArrived = Number(conversionResult?.totalArrived || 0);
  const conversionRate = totalReceived > 0 ? Math.round((totalArrived / totalReceived) * 100) : 0;
  const avgTimeToFirstVisit = avgTimeResult?.avgDays != null ? Math.round(Number(avgTimeResult.avgDays)) : null;

  return {
    totalReferrals: Number(refCountResult?.count || 0),
    totalInteractions: Number(interCountResult?.count || 0),
    activePhysicians: Number(activePhysicians?.count || 0),
    atRiskPhysicians: Number(atRiskPhysicians[0]?.count || 0),
    openTasks: Number(openTasks[0]?.count || 0),
    referralsByMonth: momData, topReferrers, conversionRate,
    avgTimeToFirstVisit, momGrowth: Math.round(momGrowth),
  };
}

export async function getPhysicianTiering(filters?: { period?: string; year?: number; month?: number }): Promise<any> {
  const period = filters?.period || "year";
  const now = new Date();
  const year = filters?.year || now.getFullYear();
  const month = filters?.month || (now.getMonth() + 1);

  let dateFrom: string, dateTo: string;
  if (period === "month") {
    dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    dateTo = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  } else {
    dateFrom = `${year}-01-01`;
    dateTo = `${year}-12-31`;
  }

  const tierThresholds = period === "month" ? { A: 5, B: 2, C: 1 } : { A: 20, B: 5, C: 1 };

  const data = await db.select({
    id: physicians.id, firstName: physicians.firstName, lastName: physicians.lastName,
    credentials: physicians.credentials, specialty: physicians.specialty,
    practiceName: physicians.practiceName, npi: physicians.npi, city: physicians.city,
    state: physicians.state, assignedOwnerId: physicians.assignedOwnerId,
    referralCount: sql<number>`count(${referrals.id})`,
  })
    .from(physicians)
    .leftJoin(referrals, and(
      eq(referrals.physicianId, physicians.id), isNull(referrals.deletedAt),
      sql`${referrals.referralDate} >= ${dateFrom}`, sql`${referrals.referralDate} <= ${dateTo}`,
    ))
    .where(isNull(physicians.deletedAt))
    .groupBy(physicians.id)
    .orderBy(desc(sql`count(${referrals.id})`));

  const tiered = data.map(p => {
    const count = Number(p.referralCount);
    let tier: string;
    if (count >= tierThresholds.A) tier = "A";
    else if (count >= tierThresholds.B) tier = "B";
    else if (count >= tierThresholds.C) tier = "C";
    else tier = "D";
    return { ...p, referralCount: count, tier };
  });

  const summary = {
    A: tiered.filter(p => p.tier === "A").length,
    B: tiered.filter(p => p.tier === "B").length,
    C: tiered.filter(p => p.tier === "C").length,
    D: tiered.filter(p => p.tier === "D").length,
  };
  return { physicians: tiered, summary, thresholds: tierThresholds, period, dateFrom, dateTo };
}

export async function getDecliningReferrals(filters?: { months?: number; minDrop?: number }): Promise<any> {
  const months = filters?.months || 3;
  const minDrop = filters?.minDrop || 1;
  const now = new Date();

  const currentEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentStart = new Date(now);
  currentStart.setMonth(currentStart.getMonth() - months);
  const currentStartStr = `${currentStart.getFullYear()}-${String(currentStart.getMonth() + 1).padStart(2, "0")}-01`;
  const priorEnd = currentStartStr;
  const priorStart = new Date(currentStart);
  priorStart.setMonth(priorStart.getMonth() - months);
  const priorStartStr = `${priorStart.getFullYear()}-${String(priorStart.getMonth() + 1).padStart(2, "0")}-01`;

  const currentCounts = await db.select({
    physicianId: referrals.physicianId, count: sql<number>`count(*)`,
  }).from(referrals).where(and(
    isNull(referrals.deletedAt), sql`${referrals.physicianId} IS NOT NULL`,
    sql`${referrals.referralDate} >= ${currentStartStr}`, sql`${referrals.referralDate} <= ${currentEnd}`,
  )).groupBy(referrals.physicianId);

  const priorCounts = await db.select({
    physicianId: referrals.physicianId, count: sql<number>`count(*)`,
  }).from(referrals).where(and(
    isNull(referrals.deletedAt), sql`${referrals.physicianId} IS NOT NULL`,
    sql`${referrals.referralDate} >= ${priorStartStr}`, sql`${referrals.referralDate} < ${priorEnd}`,
  )).groupBy(referrals.physicianId);

  const currentMap = new Map(currentCounts.map(c => [c.physicianId, Number(c.count)]));
  const priorMap = new Map(priorCounts.map(c => [c.physicianId, Number(c.count)]));
  const allIds = Array.from(new Set([...Array.from(currentMap.keys()), ...Array.from(priorMap.keys())]));
  const declining: { physicianId: string; currentCount: number; priorCount: number; change: number; changePercent: number }[] = [];

  for (const id of allIds) {
    if (!id) continue;
    const current = currentMap.get(id) || 0;
    const prior = priorMap.get(id) || 0;
    const change = current - prior;
    if (change < 0 && Math.abs(change) >= minDrop) {
      declining.push({ physicianId: id, currentCount: current, priorCount: prior, change, changePercent: prior > 0 ? Math.round((change / prior) * 100) : -100 });
    }
  }
  declining.sort((a, b) => a.change - b.change);

  const physicianIds = declining.map(d => d.physicianId).filter(Boolean);
  let physicianDetails: any[] = [];
  if (physicianIds.length > 0) {
    physicianDetails = await db.select({
      id: physicians.id, firstName: physicians.firstName, lastName: physicians.lastName,
      credentials: physicians.credentials, specialty: physicians.specialty,
      practiceName: physicians.practiceName, npi: physicians.npi, city: physicians.city,
      state: physicians.state, assignedOwnerId: physicians.assignedOwnerId,
    }).from(physicians)
      .where(and(isNull(physicians.deletedAt), sql`${physicians.id} IN (${sql.join(physicianIds.map(id => sql`${id}`), sql`, `)})`));
  }

  const physMap = new Map(physicianDetails.map(p => [p.id, p]));
  const result = declining.map(d => ({ ...d, physician: physMap.get(d.physicianId) || null }))
    .filter(d => d.physician !== null);
  return { data: result, period: { currentStart: currentStartStr, currentEnd, priorStart: priorStartStr, priorEnd, months }, total: result.length };
}

export async function getTieringWeights(): Promise<TieringWeights | undefined> {
  const [w] = await db.select().from(tieringWeights);
  return w;
}

export async function updateTieringWeights(data: Partial<TieringWeights>): Promise<TieringWeights | undefined> {
  const [existing] = await db.select().from(tieringWeights);
  if (!existing) return undefined;
  const [updated] = await db.update(tieringWeights)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tieringWeights.id, existing.id))
    .returning();
  return updated;
}

export async function getCollections(filters?: {
  physicianId?: string; locationId?: string; locationIds?: string[]; dateFrom?: string; dateTo?: string;
}): Promise<Collection[]> {
  const conditions = [];
  if (filters?.physicianId) conditions.push(eq(collections.physicianId, filters.physicianId));
  if (filters?.locationId) conditions.push(eq(collections.locationId, filters.locationId));
  if (filters?.locationIds && filters.locationIds.length > 0) conditions.push(inArray(collections.locationId, filters.locationIds));
  if (filters?.dateFrom) conditions.push(gte(collections.collectionDate, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(collections.collectionDate, filters.dateTo));
  if (conditions.length > 0) {
    return db.select().from(collections).where(and(...conditions)).orderBy(desc(collections.collectionDate));
  }
  return db.select().from(collections).orderBy(desc(collections.collectionDate));
}

export async function createCollection(col: InsertCollection): Promise<Collection> {
  const [created] = await db.insert(collections).values(col).returning();
  return created;
}

export async function exportPhysiciansCsv(filters: PhysicianFilters): Promise<any[]> {
  const conditions: any[] = [isNull(physicians.deletedAt)];
  if (filters.status && filters.status !== "all") conditions.push(eq(physicians.status, filters.status as any));
  if (filters.stage && filters.stage !== "all") conditions.push(eq(physicians.relationshipStage, filters.stage as any));
  if (filters.priority && filters.priority !== "all") conditions.push(eq(physicians.priority, filters.priority as any));
  if (filters.practiceName) conditions.push(eq(physicians.practiceName, filters.practiceName));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(
      ilike(physicians.firstName, term), ilike(physicians.lastName, term),
      ilike(sql`coalesce(${physicians.practiceName}, '')`, term),
      ilike(sql`coalesce(${physicians.npi}, '')`, term),
      ilike(sql`coalesce(${physicians.city}, '')`, term),
    ));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select({
    firstName: physicians.firstName, lastName: physicians.lastName,
    credentials: physicians.credentials, specialty: physicians.specialty,
    npi: physicians.npi, practiceName: physicians.practiceName,
    address: physicians.primaryOfficeAddress, city: physicians.city,
    state: physicians.state, zip: physicians.zip, phone: physicians.phone,
    fax: physicians.fax, email: physicians.email, status: physicians.status,
    relationshipStage: physicians.relationshipStage, priority: physicians.priority,
    referralCount: sql<number>`count(${referrals.id})`,
  })
    .from(physicians)
    .leftJoin(referrals, and(eq(referrals.physicianId, physicians.id), isNull(referrals.deletedAt)))
    .where(where)
    .groupBy(physicians.id)
    .orderBy(asc(physicians.lastName), asc(physicians.firstName));
}

export async function getScheduledReports(): Promise<ScheduledReport[]> {
  return db.select().from(scheduledReports).orderBy(desc(scheduledReports.createdAt));
}

export async function getScheduledReport(id: string): Promise<ScheduledReport | undefined> {
  const [report] = await db.select().from(scheduledReports).where(eq(scheduledReports.id, id));
  return report;
}

export async function createScheduledReport(report: InsertScheduledReport): Promise<ScheduledReport> {
  const [created] = await db.insert(scheduledReports).values(report).returning();
  return created;
}

export async function updateScheduledReport(id: string, data: Partial<InsertScheduledReport>): Promise<ScheduledReport> {
  const [updated] = await db.update(scheduledReports).set(data).where(eq(scheduledReports.id, id)).returning();
  return updated;
}

export async function deleteScheduledReport(id: string): Promise<void> {
  await db.delete(scheduledReports).where(eq(scheduledReports.id, id));
}
