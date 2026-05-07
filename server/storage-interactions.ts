/**
 * Interaction CRUD + paginated query storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, desc, and, or, ilike, isNull, gte, lte, inArray, sql } from "drizzle-orm";
import {
  interactions, physicians, users, locations,
  type Interaction, type InsertInteraction,
} from "@shared/schema";
import type { InteractionFilters, PaginatedResult } from "./storage";

export async function getInteraction(id: string): Promise<Interaction | undefined> {
  const [interaction] = await db.select().from(interactions).where(eq(interactions.id, id));
  return interaction;
}

export async function getInteractions(physicianId?: string, includeDeleted?: boolean): Promise<Interaction[]> {
  const conditions: any[] = [];
  if (physicianId) conditions.push(eq(interactions.physicianId, physicianId));
  if (!includeDeleted) conditions.push(isNull(interactions.deletedAt));
  return db.select().from(interactions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(interactions.occurredAt));
}

export async function createInteraction(inter: InsertInteraction): Promise<Interaction> {
  const [created] = await db.insert(interactions).values(inter).returning();
  await db.update(physicians)
    .set({ lastInteractionAt: new Date(inter.occurredAt), updatedAt: new Date() })
    .where(eq(physicians.id, inter.physicianId));
  return created;
}

export async function updateInteraction(id: string, data: Partial<InsertInteraction>): Promise<Interaction | undefined> {
  const [updated] = await db.update(interactions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(interactions.id, id))
    .returning();
  return updated;
}

export async function softDeleteInteraction(id: string): Promise<boolean> {
  const result = await db.update(interactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(interactions.id, id), isNull(interactions.deletedAt)));
  return (result.rowCount ?? 0) > 0;
}

export async function restoreInteraction(id: string): Promise<boolean> {
  const result = await db.update(interactions)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(interactions.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getInteractionsPaginated(filters: InteractionFilters): Promise<PaginatedResult<any>> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const conditions: any[] = [];

  if (!filters.includeDeleted) conditions.push(isNull(interactions.deletedAt));
  if (filters.type && filters.type !== "all") conditions.push(eq(interactions.type, filters.type as any));
  if (filters.locationIds && filters.locationIds.length > 0) {
    conditions.push(inArray(interactions.locationId, filters.locationIds));
  } else if (filters.locationId && filters.locationId !== "all") {
    conditions.push(eq(interactions.locationId, filters.locationId));
  }
  if (filters.physicianId) conditions.push(eq(interactions.physicianId, filters.physicianId));
  if (filters.dateFrom) conditions.push(gte(interactions.occurredAt, new Date(filters.dateFrom)));
  if (filters.dateTo) {
    const endDate = new Date(filters.dateTo);
    endDate.setHours(23, 59, 59, 999);
    conditions.push(lte(interactions.occurredAt, endDate));
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(
      ilike(interactions.summary, term),
      ilike(sql`coalesce(${interactions.nextStep}, '')`, term),
      ilike(sql`coalesce(${physicians.firstName} || ' ' || ${physicians.lastName}, '')`, term),
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(interactions)
    .leftJoin(physicians, eq(interactions.physicianId, physicians.id))
    .where(where);
  const total = Number(countResult?.count || 0);

  const data = await db
    .select({
      id: interactions.id, physicianId: interactions.physicianId,
      locationId: interactions.locationId, userId: interactions.userId,
      type: interactions.type, occurredAt: interactions.occurredAt,
      summary: interactions.summary, nextStep: interactions.nextStep,
      followUpDueAt: interactions.followUpDueAt, deletedAt: interactions.deletedAt,
      createdAt: interactions.createdAt, updatedAt: interactions.updatedAt,
      physicianFirstName: physicians.firstName, physicianLastName: physicians.lastName,
    })
    .from(interactions)
    .leftJoin(physicians, eq(interactions.physicianId, physicians.id))
    .where(where)
    .orderBy(desc(interactions.occurredAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function exportInteractionsCsv(filters?: {
  physicianId?: string; type?: string; dateFrom?: string; dateTo?: string;
}): Promise<any[]> {
  const conditions: any[] = [isNull(interactions.deletedAt)];
  if (filters?.physicianId) conditions.push(eq(interactions.physicianId, filters.physicianId));
  if (filters?.type && filters.type !== "all") conditions.push(eq(interactions.type, filters.type as any));
  if (filters?.dateFrom) conditions.push(gte(interactions.occurredAt, new Date(filters.dateFrom)));
  if (filters?.dateTo) conditions.push(lte(interactions.occurredAt, new Date(filters.dateTo)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select({
    occurredAt: interactions.occurredAt,
    type: interactions.type,
    summary: interactions.summary,
    nextStep: interactions.nextStep,
    physicianFirstName: physicians.firstName,
    physicianLastName: physicians.lastName,
    userName: users.name,
    locationName: locations.name,
  })
    .from(interactions)
    .leftJoin(physicians, eq(interactions.physicianId, physicians.id))
    .leftJoin(users, eq(interactions.userId, users.id))
    .leftJoin(locations, eq(interactions.locationId, locations.id))
    .where(where)
    .orderBy(desc(interactions.occurredAt));
}
