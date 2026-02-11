import { db } from "./db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import {
  users, locations, physicians, interactions, referrals, tasks, auditLogs, calendarEvents, userLocationAccess,
  type User, type InsertUser,
  type Location, type InsertLocation,
  type Physician, type InsertPhysician,
  type Interaction, type InsertInteraction,
  type Referral, type InsertReferral,
  type Task, type InsertTask,
  type CalendarEvent, type InsertCalendarEvent,
  type AuditLog,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;

  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(loc: InsertLocation): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;

  getPhysicians(): Promise<Physician[]>;
  getPhysician(id: string): Promise<Physician | undefined>;
  createPhysician(phys: InsertPhysician): Promise<Physician>;
  updatePhysician(id: string, data: Partial<InsertPhysician>): Promise<Physician | undefined>;

  getInteractions(physicianId?: string): Promise<Interaction[]>;
  createInteraction(inter: InsertInteraction): Promise<Interaction>;

  getReferrals(physicianId?: string): Promise<Referral[]>;
  createReferral(ref: InsertReferral): Promise<Referral>;

  getTasks(physicianId?: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask & { status: string }>): Promise<Task | undefined>;

  getCalendarEvents(filters?: { startDate?: string; endDate?: string; locationId?: string; physicianId?: string }): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: string): Promise<boolean>;

  getAuditLogs(filters?: { userId?: string; entity?: string; action?: string; limit?: number }): Promise<AuditLog[]>;
  createAuditLog(log: Omit<AuditLog, "id" | "timestamp">): Promise<void>;

  getDashboardStats(filters?: { startDate?: string; endDate?: string; locationId?: string; physicianId?: string }): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsers() {
    return db.select().from(users).orderBy(asc(users.name));
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getLocations() {
    return db.select().from(locations).orderBy(asc(locations.name));
  }

  async getLocation(id: string) {
    const [loc] = await db.select().from(locations).where(eq(locations.id, id));
    return loc;
  }

  async createLocation(loc: InsertLocation) {
    const [created] = await db.insert(locations).values(loc).returning();
    return created;
  }

  async updateLocation(id: string, data: Partial<InsertLocation>) {
    const [updated] = await db.update(locations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();
    return updated;
  }

  async deleteLocation(id: string) {
    const refCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.locationId, id));
    const interCount = await db.select({ count: sql<number>`count(*)` }).from(interactions).where(eq(interactions.locationId, id));
    if (Number(refCount[0]?.count) > 0 || Number(interCount[0]?.count) > 0) {
      throw new Error("Cannot delete location that has referrals or interactions linked to it. Deactivate it instead.");
    }
    const result = await db.delete(locations).where(eq(locations.id, id));
    return true;
  }

  async getPhysicians() {
    return db.select().from(physicians).orderBy(asc(physicians.lastName), asc(physicians.firstName));
  }

  async getPhysician(id: string) {
    const [phys] = await db.select().from(physicians).where(eq(physicians.id, id));
    return phys;
  }

  async createPhysician(phys: InsertPhysician) {
    const [created] = await db.insert(physicians).values(phys).returning();
    return created;
  }

  async updatePhysician(id: string, data: Partial<InsertPhysician>) {
    const [updated] = await db.update(physicians)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(physicians.id, id))
      .returning();
    return updated;
  }

  async getInteractions(physicianId?: string) {
    if (physicianId) {
      return db.select().from(interactions)
        .where(eq(interactions.physicianId, physicianId))
        .orderBy(desc(interactions.occurredAt));
    }
    return db.select().from(interactions).orderBy(desc(interactions.occurredAt));
  }

  async createInteraction(inter: InsertInteraction) {
    const [created] = await db.insert(interactions).values(inter).returning();
    await db.update(physicians)
      .set({ lastInteractionAt: new Date(inter.occurredAt), updatedAt: new Date() })
      .where(eq(physicians.id, inter.physicianId));
    return created;
  }

  async getReferrals(physicianId?: string) {
    if (physicianId) {
      return db.select().from(referrals)
        .where(eq(referrals.physicianId, physicianId))
        .orderBy(desc(referrals.referralDate));
    }
    return db.select().from(referrals).orderBy(desc(referrals.referralDate));
  }

  async createReferral(ref: InsertReferral) {
    const [created] = await db.insert(referrals).values(ref).returning();
    return created;
  }

  async getTasks(physicianId?: string) {
    if (physicianId) {
      return db.select().from(tasks)
        .where(eq(tasks.physicianId, physicianId))
        .orderBy(asc(tasks.dueAt));
    }
    return db.select().from(tasks).orderBy(asc(tasks.dueAt));
  }

  async createTask(task: InsertTask) {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }

  async updateTask(id: string, data: Partial<InsertTask & { status: string }>) {
    const [updated] = await db.update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async getCalendarEvents(filters?: { startDate?: string; endDate?: string; locationId?: string; physicianId?: string }) {
    const conditions = [];
    if (filters?.startDate) conditions.push(gte(calendarEvents.startAt, new Date(filters.startDate)));
    if (filters?.endDate) conditions.push(lte(calendarEvents.endAt, new Date(filters.endDate)));
    if (filters?.locationId) conditions.push(eq(calendarEvents.locationId, filters.locationId));
    if (filters?.physicianId) conditions.push(eq(calendarEvents.physicianId, filters.physicianId));

    if (conditions.length > 0) {
      return db.select().from(calendarEvents).where(and(...conditions)).orderBy(asc(calendarEvents.startAt));
    }
    return db.select().from(calendarEvents).orderBy(asc(calendarEvents.startAt));
  }

  async getCalendarEvent(id: string) {
    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    return event;
  }

  async createCalendarEvent(event: InsertCalendarEvent) {
    const [created] = await db.insert(calendarEvents).values(event).returning();
    return created;
  }

  async updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>) {
    const [updated] = await db.update(calendarEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))
      .returning();
    return updated;
  }

  async deleteCalendarEvent(id: string) {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    return true;
  }

  async getAuditLogs(filters?: { userId?: string; entity?: string; action?: string; limit?: number }) {
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

  async createAuditLog(log: Omit<AuditLog, "id" | "timestamp">) {
    await db.insert(auditLogs).values(log);
  }

  async getDashboardStats(filters?: { startDate?: string; endDate?: string; locationId?: string; physicianId?: string }) {
    const refConditions = [];
    const interConditions = [];
    const physConditions = [];

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
    if (filters?.physicianId) {
      refConditions.push(eq(referrals.physicianId, filters.physicianId));
      interConditions.push(eq(interactions.physicianId, filters.physicianId));
      physConditions.push(eq(physicians.id, filters.physicianId));
    }

    const [refCountResult] = await db.select({ count: sql<number>`count(*)` }).from(referrals)
      .where(refConditions.length > 0 ? and(...refConditions) : undefined);

    const [interCountResult] = await db.select({ count: sql<number>`count(*)` }).from(interactions)
      .where(interConditions.length > 0 ? and(...interConditions) : undefined);

    const activePhysicians = await db.select({ count: sql<number>`count(*)` }).from(physicians)
      .where(physConditions.length > 0
        ? and(eq(physicians.status, "ACTIVE"), ...physConditions)
        : eq(physicians.status, "ACTIVE"));

    const atRiskPhysicians = await db.select({ count: sql<number>`count(*)` }).from(physicians)
      .where(physConditions.length > 0
        ? and(eq(physicians.relationshipStage, "AT_RISK"), ...physConditions)
        : eq(physicians.relationshipStage, "AT_RISK"));

    const refByMonth = await db.select({
      month: sql<string>`to_char(referral_date::date, 'YYYY-MM')`,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(refConditions.length > 0 ? and(...refConditions) : undefined)
      .groupBy(sql`to_char(referral_date::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(referral_date::date, 'YYYY-MM')`);

    const topReferrers = await db.select({
      physicianId: referrals.physicianId,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(refConditions.length > 0 ? and(...refConditions) : undefined)
      .groupBy(referrals.physicianId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const openTasks = await db.select({ count: sql<number>`count(*)` }).from(tasks)
      .where(eq(tasks.status, "OPEN"));

    return {
      totalReferrals: Number(refCountResult?.count || 0),
      totalInteractions: Number(interCountResult?.count || 0),
      activePhysicians: Number(activePhysicians[0]?.count || 0),
      atRiskPhysicians: Number(atRiskPhysicians[0]?.count || 0),
      openTasks: Number(openTasks[0]?.count || 0),
      referralsByMonth: refByMonth.map(r => ({ month: r.month, count: Number(r.count) })),
      topReferrers,
    };
  }
}

export const storage = new DatabaseStorage();
