/**
 * Task CRUD + CSV export storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, asc, desc, and } from "drizzle-orm";
import {
  tasks, users, physicians,
  type Task, type InsertTask,
} from "@shared/schema";

export async function getTask(id: string): Promise<Task | undefined> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  return task;
}

export async function getTasks(physicianId?: string): Promise<Task[]> {
  if (physicianId) {
    return db.select().from(tasks)
      .where(eq(tasks.physicianId, physicianId))
      .orderBy(asc(tasks.dueAt));
  }
  return db.select().from(tasks).orderBy(asc(tasks.dueAt));
}

export async function createTask(task: InsertTask): Promise<Task> {
  const [created] = await db.insert(tasks).values(task).returning();
  return created;
}

export async function updateTask(id: string, data: Partial<InsertTask & { status: string }>): Promise<Task | undefined> {
  const [updated] = await db.update(tasks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();
  return updated;
}

export async function exportTasksCsv(filters?: { status?: string; assignedToUserId?: string }): Promise<any[]> {
  const conditions: any[] = [];
  if (filters?.status && filters.status !== "all") conditions.push(eq(tasks.status, filters.status as any));
  if (filters?.assignedToUserId && filters.assignedToUserId !== "all") {
    conditions.push(eq(tasks.assignedToUserId, filters.assignedToUserId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select({
    description: tasks.description,
    status: tasks.status,
    priority: tasks.priority,
    dueDate: tasks.dueAt,
    assignedTo: users.name,
    physicianFirstName: physicians.firstName,
    physicianLastName: physicians.lastName,
  })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedToUserId, users.id))
    .leftJoin(physicians, eq(tasks.physicianId, physicians.id))
    .where(where)
    .orderBy(desc(tasks.dueAt));
}
