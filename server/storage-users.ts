/**
 * User CRUD + authentication storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, asc, desc, sql, and, isNull } from "drizzle-orm";
import {
  users, physicians, territories, calendarEvents, auditLogs, userLocationAccess,
  interactions, tasks, locations,
  type User, type InsertUser,
} from "@shared/schema";

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function getUserByMicrosoftId(microsoftId: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.microsoftId, microsoftId));
  return user;
}

export async function getUserByResetToken(token: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
  return user;
}

export async function getUsersByApprovalStatus(status: string): Promise<User[]> {
  return db.select().from(users).where(eq(users.approvalStatus, status as any)).orderBy(desc(users.createdAt));
}

export async function getUsers(): Promise<User[]> {
  return db.select().from(users).orderBy(asc(users.name));
}

export async function createUser(user: InsertUser): Promise<User> {
  const [created] = await db.insert(users).values(user).returning();
  return created;
}

export async function updateUser(
  id: string,
  data: Partial<InsertUser> & {
    failedLoginAttempts?: number;
    lockedUntil?: Date | null;
    lastLoginAt?: Date;
    passwordChangedAt?: Date;
    approvalStatus?: string;
    passwordResetToken?: string | null;
    passwordResetExpires?: Date | null;
  }
): Promise<User | undefined> {
  const [updated] = await db.update(users)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(users.id, id))
    .returning();
  return updated;
}

export async function deleteUser(id: string): Promise<boolean> {
  const interCount = await db.select({ count: sql<number>`count(*)` }).from(interactions).where(eq(interactions.userId, id));
  const taskCount = await db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.assignedToUserId, id));
  if (Number(interCount[0]?.count) > 0 || Number(taskCount[0]?.count) > 0) {
    throw new Error("Cannot delete user that has interactions or tasks assigned. Reassign them first.");
  }
  await db.update(physicians).set({ assignedOwnerId: null }).where(eq(physicians.assignedOwnerId, id));
  await db.update(territories).set({ repUserId: null }).where(eq(territories.repUserId, id));
  await db.delete(calendarEvents).where(eq(calendarEvents.organizerUserId, id));
  await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id));
  await db.delete(userLocationAccess).where(eq(userLocationAccess.userId, id));
  await db.delete(users).where(eq(users.id, id));
  return true;
}

export async function getMarketers(): Promise<any[]> {
  const { or } = await import("drizzle-orm");
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(or(eq(users.role, "MARKETER"), eq(users.role, "DIRECTOR"), eq(users.role, "OWNER")))
    .orderBy(asc(users.name));
}

export async function getUserLocationIds(userId: string): Promise<string[]> {
  const rows = await db.select({ locationId: userLocationAccess.locationId })
    .from(userLocationAccess)
    .where(eq(userLocationAccess.userId, userId));
  return rows.map(r => r.locationId);
}

export async function assignUserToAllLocations(userId: string): Promise<void> {
  const allLocations = await db.select({ id: locations.id }).from(locations);
  const existing = await getUserLocationIds(userId);
  const existingSet = new Set(existing);
  for (const loc of allLocations) {
    if (!existingSet.has(loc.id)) {
      await db.insert(userLocationAccess).values({ userId, locationId: loc.id });
    }
  }
}
