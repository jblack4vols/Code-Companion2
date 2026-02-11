import { db } from "./db";
import { eq, and, desc, asc, ilike, sql } from "drizzle-orm";
import {
  users, locations, physicians, interactions, referrals, tasks, auditLogs, userLocationAccess,
  type User, type InsertUser,
  type Location, type InsertLocation,
  type Physician, type InsertPhysician,
  type Interaction, type InsertInteraction,
  type Referral, type InsertReferral,
  type Task, type InsertTask,
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

  createAuditLog(log: Omit<AuditLog, "id" | "timestamp">): Promise<void>;
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

  async createAuditLog(log: Omit<AuditLog, "id" | "timestamp">) {
    await db.insert(auditLogs).values(log);
  }
}

export const storage = new DatabaseStorage();
