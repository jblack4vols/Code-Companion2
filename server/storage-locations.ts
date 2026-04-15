/**
 * Location and territory CRUD storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, asc, sql, and } from "drizzle-orm";
import {
  locations, territories, referrals, interactions,
  type Location, type InsertLocation,
  type Territory, type InsertTerritory,
} from "@shared/schema";

// ---- Locations ----

export async function getLocations(): Promise<Location[]> {
  return db.select().from(locations).orderBy(asc(locations.name));
}

export async function getLocation(id: string): Promise<Location | undefined> {
  const [loc] = await db.select().from(locations).where(eq(locations.id, id));
  return loc;
}

export async function createLocation(loc: InsertLocation): Promise<Location> {
  const [created] = await db.insert(locations).values(loc).returning();
  return created;
}

export async function updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined> {
  const [updated] = await db.update(locations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(locations.id, id))
    .returning();
  return updated;
}

export async function deleteLocation(id: string): Promise<boolean> {
  const refCount = await db.select({ count: sql<number>`count(*)` })
    .from(referrals).where(eq(referrals.locationId, id));
  const interCount = await db.select({ count: sql<number>`count(*)` })
    .from(interactions).where(eq(interactions.locationId, id));
  if (Number(refCount[0]?.count) > 0 || Number(interCount[0]?.count) > 0) {
    throw new Error("Cannot delete location that has referrals or interactions linked to it. Deactivate it instead.");
  }
  await db.delete(locations).where(eq(locations.id, id));
  return true;
}

export async function findLocationByName(name: string): Promise<Location | undefined> {
  const { ilike } = await import("drizzle-orm");
  const [found] = await db.select().from(locations)
    .where(ilike(locations.name, `%${name.trim()}%`)).limit(1);
  return found;
}

// ---- Territories ----

export async function getTerritories(): Promise<Territory[]> {
  return db.select().from(territories).orderBy(asc(territories.name));
}

export async function getTerritory(id: string): Promise<Territory | undefined> {
  const [t] = await db.select().from(territories).where(eq(territories.id, id));
  return t;
}

export async function createTerritory(territory: InsertTerritory): Promise<Territory> {
  const [created] = await db.insert(territories).values(territory).returning();
  return created;
}

export async function updateTerritory(id: string, data: Partial<InsertTerritory>): Promise<Territory | undefined> {
  const [updated] = await db.update(territories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(territories.id, id))
    .returning();
  return updated;
}

export async function deleteTerritory(id: string): Promise<boolean> {
  await db.delete(territories).where(eq(territories.id, id));
  return true;
}
