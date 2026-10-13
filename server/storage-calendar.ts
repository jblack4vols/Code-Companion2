/**
 * Calendar event CRUD storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, asc, and, gte, lte, inArray } from "drizzle-orm";
import {
  calendarEvents,
  type CalendarEvent, type InsertCalendarEvent,
} from "@shared/schema";

export async function getCalendarEvents(filters?: {
  startDate?: string;
  endDate?: string;
  locationId?: string;
  physicianId?: string;
  practiceName?: string;
  /** Filter by one or more organizer user IDs */
  userIds?: string[];
}): Promise<CalendarEvent[]> {
  const conditions = [];
  if (filters?.startDate) conditions.push(gte(calendarEvents.startAt, new Date(filters.startDate)));
  if (filters?.endDate) conditions.push(lte(calendarEvents.endAt, new Date(filters.endDate)));
  if (filters?.locationId) conditions.push(eq(calendarEvents.locationId, filters.locationId));
  if (filters?.physicianId) conditions.push(eq(calendarEvents.physicianId, filters.physicianId));
  if (filters?.practiceName) conditions.push(eq(calendarEvents.practiceName, filters.practiceName));
  if (filters?.userIds?.length) conditions.push(inArray(calendarEvents.organizerUserId, filters.userIds));

  if (conditions.length > 0) {
    return db.select().from(calendarEvents).where(and(...conditions)).orderBy(asc(calendarEvents.startAt));
  }
  return db.select().from(calendarEvents).orderBy(asc(calendarEvents.startAt));
}

export async function getCalendarEvent(id: string): Promise<CalendarEvent | undefined> {
  const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
  return event;
}

export async function createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
  const [created] = await db.insert(calendarEvents).values(event).returning();
  return created;
}

export async function updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
  const [updated] = await db.update(calendarEvents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(calendarEvents.id, id))
    .returning();
  return updated;
}

export async function deleteCalendarEvent(id: string): Promise<boolean> {
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  return true;
}
