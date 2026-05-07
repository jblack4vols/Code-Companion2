/**
 * Referral CRUD + bulk operations storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, desc, asc, and, or, ilike, isNull, isNotNull, gte, lte, inArray, sql } from "drizzle-orm";
import {
  referrals, physicians, locations,
  type Referral, type InsertReferral,
} from "@shared/schema";
import type { ReferralFilters, PaginatedResult } from "./storage";

export async function getReferrals(physicianId?: string, locationIds?: string[]): Promise<Referral[]> {
  const conditions: any[] = [isNull(referrals.deletedAt)];
  if (physicianId) conditions.push(eq(referrals.physicianId, physicianId));
  if (locationIds && locationIds.length > 0) conditions.push(inArray(referrals.locationId, locationIds));
  return db.select().from(referrals).where(and(...conditions)).orderBy(desc(referrals.referralDate));
}

export async function getReferralsPaginated(filters: ReferralFilters): Promise<PaginatedResult<any>> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const conditions: any[] = [isNull(referrals.deletedAt)];

  if (filters.status && filters.status !== "all") conditions.push(eq(referrals.status, filters.status as any));
  if (filters.locationId && filters.locationId !== "all") conditions.push(eq(referrals.locationId, filters.locationId));
  if (filters.locationIds && filters.locationIds.length > 0) conditions.push(inArray(referrals.locationId, filters.locationIds));
  if (filters.discipline && filters.discipline !== "all") conditions.push(eq(referrals.discipline, filters.discipline));
  if (filters.referralSource && filters.referralSource !== "all") conditions.push(eq(referrals.referralSource, filters.referralSource));
  if (filters.primaryPayerType && filters.primaryPayerType !== "all") conditions.push(eq(referrals.primaryPayerType, filters.primaryPayerType));
  if (filters.physicianId) conditions.push(eq(referrals.physicianId, filters.physicianId));
  if (filters.dateFrom) conditions.push(gte(referrals.referralDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(referrals.referralDate, filters.dateTo));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(
      ilike(sql`coalesce(${referrals.patientFullName}, '')`, term),
      ilike(sql`coalesce(${referrals.patientAccountNumber}, '')`, term),
      ilike(sql`coalesce(${referrals.caseTherapist}, '')`, term),
      ilike(sql`coalesce(${physicians.firstName} || ' ' || ${physicians.lastName}, '')`, term),
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(referrals).leftJoin(physicians, eq(referrals.physicianId, physicians.id)).where(where);
  const total = Number(countResult?.count || 0);

  const activeCount = await db.select({ count: sql<number>`count(*)` })
    .from(referrals).leftJoin(physicians, eq(referrals.physicianId, physicians.id))
    .where(where ? and(where, sql`${referrals.status} != 'DISCHARGED'`) : sql`${referrals.status} != 'DISCHARGED'`);

  const dischargedCount = await db.select({ count: sql<number>`count(*)` })
    .from(referrals).leftJoin(physicians, eq(referrals.physicianId, physicians.id))
    .where(where ? and(where, eq(referrals.status, "DISCHARGED")) : eq(referrals.status, "DISCHARGED"));

  const dir = filters.sortDir === "asc" ? asc : desc;
  let orderClause: any[];
  switch (filters.sortBy) {
    case "referralDate": orderClause = [dir(referrals.referralDate)]; break;
    case "patientFullName": orderClause = [dir(referrals.patientFullName)]; break;
    case "status": orderClause = [dir(referrals.status)]; break;
    case "referringProviderName": orderClause = [dir(physicians.lastName), dir(physicians.firstName)]; break;
    default: orderClause = [desc(referrals.referralDate)];
  }

  const data = await db.select({
    id: referrals.id, physicianId: referrals.physicianId, locationId: referrals.locationId,
    referralDate: referrals.referralDate, patientAccountNumber: referrals.patientAccountNumber,
    patientInitialsOrAnonId: referrals.patientInitialsOrAnonId, patientFullName: referrals.patientFullName,
    patientDob: referrals.patientDob, patientPhone: referrals.patientPhone,
    caseTitle: referrals.caseTitle, caseTherapist: referrals.caseTherapist,
    dateOfInitialEval: referrals.dateOfInitialEval, referralSource: referrals.referralSource,
    dischargeDate: referrals.dischargeDate, dischargeReason: referrals.dischargeReason,
    referringProviderName: referrals.referringProviderName, referringProviderNpi: referrals.referringProviderNpi,
    scheduledVisits: referrals.scheduledVisits, arrivedVisits: referrals.arrivedVisits,
    discipline: referrals.discipline, primaryInsurance: referrals.primaryInsurance,
    primaryPayerType: referrals.primaryPayerType,
    dateOfFirstScheduledVisit: referrals.dateOfFirstScheduledVisit,
    dateOfFirstArrivedVisit: referrals.dateOfFirstArrivedVisit,
    createdToArrived: referrals.createdToArrived, payerType: referrals.payerType,
    diagnosisCategory: referrals.diagnosisCategory, customFields: referrals.customFields,
    status: referrals.status, valueEstimate: referrals.valueEstimate,
    physicianFirstName: physicians.firstName, physicianLastName: physicians.lastName,
    physicianCredentials: physicians.credentials, locationName: locations.name,
  })
    .from(referrals)
    .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
    .leftJoin(locations, eq(referrals.locationId, locations.id))
    .where(where)
    .orderBy(...orderClause)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    data, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    activeCount: Number(activeCount[0]?.count || 0),
    dischargedCount: Number(dischargedCount[0]?.count || 0),
  } as any;
}

export async function createReferral(ref: InsertReferral): Promise<Referral> {
  const [created] = await db.insert(referrals).values(ref).returning();
  return created;
}

export async function updateReferral(id: string, data: Partial<InsertReferral>): Promise<Referral | undefined> {
  const [updated] = await db.update(referrals)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(referrals.id, id), isNull(referrals.deletedAt)))
    .returning();
  return updated;
}

export async function softDeleteReferral(id: string): Promise<boolean> {
  const result = await db.update(referrals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(referrals.id, id), isNull(referrals.deletedAt)));
  return (result.rowCount ?? 0) > 0;
}

export async function restoreReferral(id: string): Promise<boolean> {
  const result = await db.update(referrals)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(referrals.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function softDeleteAllReferrals(): Promise<number> {
  const result = await db.update(referrals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(isNull(referrals.deletedAt));
  return result.rowCount ?? 0;
}

export async function restoreAllReferrals(): Promise<number> {
  const result = await db.update(referrals)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(isNotNull(referrals.deletedAt));
  return result.rowCount ?? 0;
}

export async function bulkUpsertReferrals(rows: InsertReferral[]): Promise<{ inserted: number; updated: number; errors: string[] }> {
  let inserted = 0, updated = 0;
  const errors: string[] = [];

  const accountNumbers = rows.map(r => r.patientAccountNumber).filter((v): v is string => !!v);
  let existingReferrals: Referral[] = [];
  if (accountNumbers.length > 0) {
    const uniqueAccounts = Array.from(new Set(accountNumbers));
    const batchSize = 500;
    for (let b = 0; b < uniqueAccounts.length; b += batchSize) {
      const batch = uniqueAccounts.slice(b, b + batchSize);
      const results = await db.select().from(referrals).where(inArray(referrals.patientAccountNumber, batch));
      existingReferrals.push(...results);
    }
  }

  const referralMap = new Map<string, Referral[]>();
  for (const ref of existingReferrals) {
    if (ref.patientAccountNumber) {
      const list = referralMap.get(ref.patientAccountNumber) || [];
      list.push(ref);
      referralMap.set(ref.patientAccountNumber, list);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      if (row.patientAccountNumber) {
        const candidates = referralMap.get(row.patientAccountNumber);
        if (candidates) {
          let existing: Referral | undefined;
          existing = row.caseTitle ? candidates.find(c => c.caseTitle === row.caseTitle) : candidates[0];
          if (existing) {
            const updateData: any = { ...row };
            delete updateData.id;
            await db.update(referrals).set({ ...updateData, updatedAt: new Date() }).where(eq(referrals.id, existing.id));
            updated++;
            continue;
          }
        }
      }
      await db.insert(referrals).values(row);
      inserted++;
    } catch (e: any) {
      errors.push(`Row ${i + 1}: ${e.message}`);
    }
  }
  return { inserted, updated, errors };
}

export async function bulkDeleteReferrals(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.update(referrals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(referrals.id, ids), isNull(referrals.deletedAt)));
  return result.rowCount ?? 0;
}

export async function getUnlinkedReferrals(page: number = 1, pageSize: number = 50): Promise<PaginatedResult<any>> {
  const offset = (page - 1) * pageSize;
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(referrals).where(and(isNull(referrals.physicianId), isNull(referrals.deletedAt)));
  const total = Number(countResult[0].count);
  const data = await db.select().from(referrals)
    .where(and(isNull(referrals.physicianId), isNull(referrals.deletedAt)))
    .orderBy(desc(referrals.referralDate))
    .limit(pageSize).offset(offset);
  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function linkReferralToPhysician(referralId: string, physicianId: string): Promise<Referral | undefined> {
  const [physician] = await db.select().from(physicians)
    .where(and(eq(physicians.id, physicianId), isNull(physicians.deletedAt)));
  if (!physician) return undefined;
  const [updated] = await db.update(referrals).set({
    physicianId,
    referringProviderName: `${physician.lastName}, ${physician.firstName}`,
    referringProviderNpi: physician.npi,
    updatedAt: new Date(),
  }).where(eq(referrals.id, referralId)).returning();
  return updated;
}

export async function bulkLinkReferralsByProviderName(providerName: string, physicianId: string, excludeId: string): Promise<number> {
  const [physician] = await db.select().from(physicians)
    .where(and(eq(physicians.id, physicianId), isNull(physicians.deletedAt)));
  if (!physician) return 0;
  const result = await db.update(referrals).set({
    physicianId,
    referringProviderName: `${physician.lastName}, ${physician.firstName}`,
    referringProviderNpi: physician.npi,
    updatedAt: new Date(),
  }).where(and(
    isNull(referrals.physicianId),
    isNull(referrals.deletedAt),
    eq(referrals.referringProviderName, providerName),
    sql`${referrals.id} != ${excludeId}`,
  ));
  return result.rowCount ?? 0;
}

export async function categorizeReferralAsSelfReferral(referralId: string): Promise<Referral | undefined> {
  const [updated] = await db.update(referrals).set({
    referringProviderName: "Self-Referral / Walk-In",
    referralSource: "Self-Referral",
    updatedAt: new Date(),
  }).where(eq(referrals.id, referralId)).returning();
  return updated;
}

export async function exportReferralsCsv(filters: ReferralFilters): Promise<any[]> {
  const conditions: any[] = [isNull(referrals.deletedAt)];
  if (filters.status && filters.status !== "all") conditions.push(eq(referrals.status, filters.status as any));
  if (filters.locationId && filters.locationId !== "all") conditions.push(eq(referrals.locationId, filters.locationId));
  if (filters.discipline && filters.discipline !== "all") conditions.push(eq(referrals.discipline, filters.discipline));
  if (filters.physicianId) conditions.push(eq(referrals.physicianId, filters.physicianId));
  if (filters.dateFrom) conditions.push(sql`${referrals.referralDate} >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(sql`${referrals.referralDate} <= ${filters.dateTo}`);
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(
      ilike(sql`coalesce(${referrals.patientFullName}, '')`, term),
      ilike(sql`coalesce(${referrals.patientAccountNumber}, '')`, term),
      ilike(sql`coalesce(${referrals.caseTherapist}, '')`, term),
    ));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select({
    referralDate: referrals.referralDate, patientFullName: referrals.patientFullName,
    patientAccountNumber: referrals.patientAccountNumber, caseTitle: referrals.caseTitle,
    caseTherapist: referrals.caseTherapist, discipline: referrals.discipline,
    status: referrals.status, primaryInsurance: referrals.primaryInsurance,
    scheduledVisits: referrals.scheduledVisits, arrivedVisits: referrals.arrivedVisits,
    dateOfInitialEval: referrals.dateOfInitialEval, dischargeDate: referrals.dischargeDate,
    dischargeReason: referrals.dischargeReason, referralSource: referrals.referralSource,
    physicianFirstName: physicians.firstName, physicianLastName: physicians.lastName,
    locationName: locations.name,
  })
    .from(referrals)
    .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
    .leftJoin(locations, eq(referrals.locationId, locations.id))
    .where(where)
    .orderBy(desc(referrals.referralDate));
}
