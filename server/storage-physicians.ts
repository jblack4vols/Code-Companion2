/**
 * Physician CRUD + bulk operations storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, asc, desc, sql, and, or, ilike, isNull, inArray } from "drizzle-orm";
import {
  physicians, referrals, physicianFavorites, physicianComments, physicianStageHistory,
  interactionTemplates,
  type Physician, type InsertPhysician,
  type PhysicianComment, type InsertPhysicianComment,
  type InteractionTemplate, type InsertInteractionTemplate,
  type PhysicianStageHistory,
} from "@shared/schema";
import type { PhysicianFilters, PaginatedResult } from "./storage";

// ---- Basic CRUD ----

export async function getPhysicians(): Promise<Physician[]> {
  return db.select().from(physicians)
    .where(isNull(physicians.deletedAt))
    .orderBy(asc(physicians.lastName), asc(physicians.firstName));
}

export async function searchPhysiciansTypeahead(
  query: string,
  limit: number = 15
): Promise<Pick<Physician, "id" | "firstName" | "lastName" | "credentials" | "npi" | "practiceName" | "specialty">[]> {
  const term = `%${query}%`;
  return db.select({
    id: physicians.id,
    firstName: physicians.firstName,
    lastName: physicians.lastName,
    credentials: physicians.credentials,
    npi: physicians.npi,
    practiceName: physicians.practiceName,
    specialty: physicians.specialty,
  })
    .from(physicians)
    .where(and(
      isNull(physicians.deletedAt),
      or(
        ilike(physicians.firstName, term),
        ilike(physicians.lastName, term),
        ilike(sql`coalesce(${physicians.practiceName}, '')`, term),
        ilike(sql`coalesce(${physicians.npi}, '')`, term),
        ilike(sql`concat(${physicians.firstName}, ' ', ${physicians.lastName})`, term),
      )
    ))
    .orderBy(asc(physicians.lastName), asc(physicians.firstName))
    .limit(limit);
}

export async function getPhysiciansPaginated(filters: PhysicianFilters): Promise<PaginatedResult<any>> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const conditions: any[] = [isNull(physicians.deletedAt)];

  if (filters.status && filters.status !== "all") conditions.push(eq(physicians.status, filters.status as any));
  if (filters.stage && filters.stage !== "all") conditions.push(eq(physicians.relationshipStage, filters.stage as any));
  if (filters.priority && filters.priority !== "all") conditions.push(eq(physicians.priority, filters.priority as any));
  if (filters.practiceName) conditions.push(eq(physicians.practiceName, filters.practiceName));
  if (filters.locationIds && filters.locationIds.length > 0) {
    conditions.push(
      sql`${physicians.id} IN (SELECT DISTINCT ${referrals.physicianId} FROM ${referrals} WHERE ${referrals.deletedAt} IS NULL AND ${inArray(referrals.locationId, filters.locationIds)})`
    );
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(
      ilike(physicians.firstName, term),
      ilike(physicians.lastName, term),
      ilike(sql`coalesce(${physicians.practiceName}, '')`, term),
      ilike(sql`coalesce(${physicians.credentials}, '')`, term),
      ilike(sql`coalesce(${physicians.npi}, '')`, term),
      ilike(sql`coalesce(${physicians.city}, '')`, term),
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(physicians).where(where);
  const total = Number(countResult?.count || 0);

  const refCountExpr = sql<number>`count(${referrals.id})`;
  const sortDir = filters.sortOrder === "desc" ? desc : asc;
  let orderClause: any[];
  switch (filters.sortBy) {
    case "name": orderClause = [sortDir(physicians.lastName), sortDir(physicians.firstName)]; break;
    case "location": orderClause = [sortDir(physicians.city)]; break;
    case "status": orderClause = [sortDir(physicians.status)]; break;
    case "stage": orderClause = [sortDir(physicians.relationshipStage)]; break;
    case "priority": orderClause = [sortDir(physicians.priority)]; break;
    case "referrals": orderClause = [sortDir(refCountExpr)]; break;
    default: orderClause = [asc(physicians.lastName), asc(physicians.firstName)];
  }

  const data = await db.select({
    id: physicians.id, firstName: physicians.firstName, lastName: physicians.lastName,
    credentials: physicians.credentials, specialty: physicians.specialty,
    practiceName: physicians.practiceName, npi: physicians.npi, phone: physicians.phone,
    fax: physicians.fax, email: physicians.email, primaryOfficeAddress: physicians.primaryOfficeAddress,
    city: physicians.city, state: physicians.state, zip: physicians.zip,
    status: physicians.status, relationshipStage: physicians.relationshipStage,
    priority: physicians.priority, assignedOwnerId: physicians.assignedOwnerId,
    lastInteractionAt: physicians.lastInteractionAt, nextFollowUpAt: physicians.nextFollowUpAt,
    notes: physicians.notes, tags: physicians.tags, createdAt: physicians.createdAt,
    referralCount: refCountExpr,
  })
    .from(physicians)
    .leftJoin(referrals, and(
      eq(referrals.physicianId, physicians.id),
      isNull(referrals.deletedAt),
      sql`${referrals.referralDate} >= '2025-01-01'`,
      sql`${referrals.referralDate} <= '2026-01-31'`,
    ))
    .where(where)
    .groupBy(physicians.id)
    .orderBy(...orderClause)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getPhysicianIdsByLocations(locationIds: string[]): Promise<Set<string>> {
  if (locationIds.length === 0) return new Set();
  const { isNotNull } = await import("drizzle-orm");
  const rows = await db.selectDistinct({ physicianId: referrals.physicianId })
    .from(referrals)
    .where(and(
      isNull(referrals.deletedAt),
      inArray(referrals.locationId, locationIds),
      isNotNull(referrals.physicianId),
    ));
  return new Set(rows.map(r => r.physicianId).filter(Boolean) as string[]);
}

export async function getPhysician(id: string): Promise<Physician | undefined> {
  const [phys] = await db.select().from(physicians).where(and(eq(physicians.id, id), isNull(physicians.deletedAt)));
  return phys;
}

export async function createPhysician(phys: InsertPhysician): Promise<Physician> {
  const [created] = await db.insert(physicians).values(phys).returning();
  return created;
}

export async function updatePhysician(id: string, data: Partial<InsertPhysician>): Promise<Physician | undefined> {
  const [updated] = await db.update(physicians)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(physicians.id, id))
    .returning();
  return updated;
}

export async function softDeletePhysician(id: string): Promise<boolean> {
  const result = await db.update(physicians)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(physicians.id, id), isNull(physicians.deletedAt)));
  return (result.rowCount ?? 0) > 0;
}

export async function restorePhysician(id: string): Promise<boolean> {
  const result = await db.update(physicians)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(physicians.id, id));
  return (result.rowCount ?? 0) > 0;
}

// ---- Bulk operations ----

export async function assignPhysicianToMarketer(physicianId: string, marketerId: string | null): Promise<Physician | undefined> {
  const [updated] = await db.update(physicians)
    .set({ assignedOwnerId: marketerId, updatedAt: new Date() })
    .where(eq(physicians.id, physicianId))
    .returning();
  return updated;
}

export async function bulkAssignPhysiciansToMarketer(physicianIds: string[], marketerId: string | null): Promise<number> {
  if (physicianIds.length === 0) return 0;
  await db.update(physicians)
    .set({ assignedOwnerId: marketerId, updatedAt: new Date() })
    .where(sql`${physicians.id} IN (${sql.join(physicianIds.map(id => sql`${id}`), sql`, `)})`);
  return physicianIds.length;
}

export async function bulkUpdatePhysicianStatus(physicianIds: string[], status: string): Promise<number> {
  if (physicianIds.length === 0) return 0;
  await db.update(physicians)
    .set({ status: status as any, updatedAt: new Date() })
    .where(sql`${physicians.id} IN (${sql.join(physicianIds.map(id => sql`${id}`), sql`, `)})`);
  return physicianIds.length;
}

export async function findPhysicianByNameAndNpi(firstName: string, lastName: string, npi?: string | null): Promise<Physician | undefined> {
  const conditions: any[] = [
    isNull(physicians.deletedAt),
    ilike(physicians.firstName, firstName.trim()),
    ilike(physicians.lastName, lastName.trim()),
  ];
  if (npi) conditions.push(eq(physicians.npi, npi.trim()));
  const [found] = await db.select().from(physicians).where(and(...conditions)).limit(1);
  return found;
}

export async function fuzzyFindPhysicians(lastName: string, firstName?: string): Promise<Physician[]> {
  const conditions: any[] = [
    isNull(physicians.deletedAt),
    ilike(physicians.lastName, `%${lastName.trim()}%`),
  ];
  if (firstName && firstName.trim().length > 1) {
    conditions.push(ilike(physicians.firstName, `${firstName.trim().charAt(0)}%`));
  }
  return db.select().from(physicians).where(and(...conditions)).limit(5);
}

export async function bulkUpsertPhysicians(rows: InsertPhysician[]): Promise<{ inserted: number; updated: number; errors: string[] }> {
  let inserted = 0, updated = 0;
  const errors: string[] = [];
  const allExisting = await db.select().from(physicians).where(isNull(physicians.deletedAt));

  const npiMap = new Map<string, Physician>();
  const nameMap = new Map<string, Physician[]>();
  for (const p of allExisting) {
    if (p.npi) npiMap.set(p.npi.trim().toLowerCase(), p);
    const nameKey = `${p.firstName.trim().toLowerCase()}|${p.lastName.trim().toLowerCase()}`;
    const list = nameMap.get(nameKey) || [];
    list.push(p);
    nameMap.set(nameKey, list);
  }

  const findMatch = (firstName: string, lastName: string, npi?: string | null): Physician | undefined => {
    const fnLower = firstName.trim().toLowerCase();
    const lnLower = lastName.trim().toLowerCase();
    if (npi) {
      const byNpi = npiMap.get(npi.trim().toLowerCase());
      if (byNpi && byNpi.firstName.trim().toLowerCase() === fnLower && byNpi.lastName.trim().toLowerCase() === lnLower) return byNpi;
    }
    const nameKey = `${fnLower}|${lnLower}`;
    const candidates = nameMap.get(nameKey);
    if (candidates) {
      if (npi) {
        const withNpi = candidates.find(c => c.npi && c.npi.trim().toLowerCase() === npi.trim().toLowerCase());
        if (withNpi) return withNpi;
      }
      return candidates.find(c => !npi || !c.npi) || candidates[0];
    }
    return undefined;
  };

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      const existing = findMatch(row.firstName, row.lastName, row.npi);
      if (existing) {
        const updateData: any = {};
        if (row.credentials && !existing.credentials) updateData.credentials = row.credentials;
        if (row.npi && !existing.npi) updateData.npi = row.npi;
        if (row.practiceName && !existing.practiceName) updateData.practiceName = row.practiceName;
        if (row.primaryOfficeAddress && !existing.primaryOfficeAddress) updateData.primaryOfficeAddress = row.primaryOfficeAddress;
        if (row.city && !existing.city) updateData.city = row.city;
        if (row.state && !existing.state) updateData.state = row.state;
        if (row.zip && !existing.zip) updateData.zip = row.zip;
        if (row.phone && !existing.phone) updateData.phone = row.phone;
        if (row.fax && !existing.fax) updateData.fax = row.fax;
        if (row.email && !existing.email) updateData.email = row.email;
        if (row.specialty && !existing.specialty) updateData.specialty = row.specialty;
        if (row.customFields) {
          updateData.customFields = existing.customFields
            ? { ...existing.customFields, ...row.customFields }
            : row.customFields;
        }
        if (Object.keys(updateData).length > 0) {
          await db.update(physicians).set({ ...updateData, updatedAt: new Date() }).where(eq(physicians.id, existing.id));
          updated++;
        }
      } else {
        await db.insert(physicians).values(row);
        inserted++;
      }
    } catch (e: any) {
      errors.push(`Row ${i + 1}: ${e.message}`);
    }
  }
  return { inserted, updated, errors };
}

export async function getMarketerTerritories(getMarketers: () => Promise<any[]>): Promise<any> {
  const assigned = await db.select({
    marketerId: physicians.assignedOwnerId,
    count: sql<number>`count(*)`,
  })
    .from(physicians)
    .where(and(isNull(physicians.deletedAt), sql`${physicians.assignedOwnerId} IS NOT NULL`))
    .groupBy(physicians.assignedOwnerId);

  const [unassigned] = await db.select({ count: sql<number>`count(*)` })
    .from(physicians)
    .where(and(isNull(physicians.deletedAt), sql`${physicians.assignedOwnerId} IS NULL`));

  const marketersList = await getMarketers();
  const assignedMap = new Map(assigned.map(a => [a.marketerId, Number(a.count)]));
  const territoriesList = marketersList.map(m => ({
    marketer: m,
    assignedCount: assignedMap.get(m.id) || 0,
  }));

  const totalCount = await db.select({ count: sql<number>`count(*)` })
    .from(physicians).where(isNull(physicians.deletedAt))
    .then(r => Number(r[0]?.count || 0));

  return { territories: territoriesList, unassignedCount: Number(unassigned?.count || 0), totalPhysicians: totalCount };
}

// ---- Favorites ----

export async function getPhysicianFavorites(userId: string): Promise<string[]> {
  const rows = await db.select({ physicianId: physicianFavorites.physicianId })
    .from(physicianFavorites)
    .where(eq(physicianFavorites.userId, userId));
  return rows.map(r => r.physicianId);
}

export async function addPhysicianFavorite(userId: string, physicianId: string): Promise<void> {
  await db.insert(physicianFavorites).values({ userId, physicianId }).onConflictDoNothing();
}

export async function removePhysicianFavorite(userId: string, physicianId: string): Promise<void> {
  await db.delete(physicianFavorites).where(
    and(eq(physicianFavorites.userId, userId), eq(physicianFavorites.physicianId, physicianId))
  );
}

// ---- Comments ----

export async function getPhysicianComments(physicianId: string): Promise<PhysicianComment[]> {
  return db.select().from(physicianComments)
    .where(eq(physicianComments.physicianId, physicianId))
    .orderBy(desc(physicianComments.createdAt));
}

export async function createPhysicianComment(comment: InsertPhysicianComment): Promise<PhysicianComment> {
  const [created] = await db.insert(physicianComments).values(comment).returning();
  return created;
}

export async function updatePhysicianComment(id: string, content: string): Promise<PhysicianComment | undefined> {
  const [updated] = await db.update(physicianComments)
    .set({ content, updatedAt: new Date() })
    .where(eq(physicianComments.id, id)).returning();
  return updated;
}

export async function deletePhysicianComment(id: string): Promise<boolean> {
  const result = await db.delete(physicianComments).where(eq(physicianComments.id, id));
  return (result.rowCount ?? 0) > 0;
}

// ---- Stage history & interaction templates ----

export async function getPhysicianStageHistory(physicianId: string): Promise<PhysicianStageHistory[]> {
  return db.select().from(physicianStageHistory)
    .where(eq(physicianStageHistory.physicianId, physicianId))
    .orderBy(desc(physicianStageHistory.changedAt));
}

export async function getInteractionTemplates(): Promise<InteractionTemplate[]> {
  return db.select().from(interactionTemplates)
    .where(eq(interactionTemplates.isActive, true))
    .orderBy(asc(interactionTemplates.name));
}

export async function createInteractionTemplate(template: InsertInteractionTemplate): Promise<InteractionTemplate> {
  const [created] = await db.insert(interactionTemplates).values(template).returning();
  return created;
}

export async function updateInteractionTemplate(id: string, data: Partial<InsertInteractionTemplate>): Promise<InteractionTemplate | undefined> {
  const [updated] = await db.update(interactionTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(interactionTemplates.id, id))
    .returning();
  return updated;
}

export async function deleteInteractionTemplate(id: string): Promise<boolean> {
  const [updated] = await db.update(interactionTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(interactionTemplates.id, id))
    .returning();
  return !!updated;
}
