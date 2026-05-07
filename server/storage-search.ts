/**
 * Global search + typeahead storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { and, or, ilike, isNull, sql } from "drizzle-orm";
import { physicians, referrals } from "@shared/schema";

export async function globalSearch(
  query: string,
  limit: number = 10
): Promise<{ physicians: any[]; referrals: any[] }> {
  const searchPattern = `%${query}%`;

  const physicianResults = await db.select({
    id: physicians.id,
    firstName: physicians.firstName,
    lastName: physicians.lastName,
    npi: physicians.npi,
    practiceName: physicians.practiceName,
    specialty: physicians.specialty,
    credentials: physicians.credentials,
  }).from(physicians)
    .where(and(
      isNull(physicians.deletedAt),
      or(
        ilike(physicians.firstName, searchPattern),
        ilike(physicians.lastName, searchPattern),
        ilike(physicians.npi, searchPattern),
        ilike(physicians.practiceName, searchPattern),
        sql`CONCAT(${physicians.firstName}, ' ', ${physicians.lastName}) ILIKE ${searchPattern}`
      )
    ))
    .limit(limit);

  const referralResults = await db.select({
    id: referrals.id,
    patientFullName: referrals.patientFullName,
    patientAccountNumber: referrals.patientAccountNumber,
    referralDate: referrals.referralDate,
    referringProviderName: referrals.referringProviderName,
    locationId: referrals.locationId,
    status: referrals.status,
  }).from(referrals)
    .where(and(
      isNull(referrals.deletedAt),
      or(
        ilike(referrals.patientFullName, searchPattern),
        ilike(referrals.patientAccountNumber, searchPattern),
        ilike(referrals.referringProviderName, searchPattern)
      )
    ))
    .limit(limit);

  return { physicians: physicianResults, referrals: referralResults };
}

export async function getSuggestedPhysicianMatches(referralId: string): Promise<any[]> {
  const { eq, ilike: ilikeOp } = await import("drizzle-orm");
  const [ref] = await db.select().from(referrals).where(eq(referrals.id, referralId));
  if (!ref?.referringProviderName) return [];

  const name = ref.referringProviderName.replace(/^(Dr\.?\s*)/i, "").trim();
  const parts = name.split(/\s+/);

  if (parts.length < 2) {
    return db.select().from(physicians)
      .where(and(isNull(physicians.deletedAt), ilike(physicians.lastName, `%${parts[0]}%`)))
      .limit(5);
  }

  const lastName = parts.slice(1).join(" ").replace(/,?\s*(MD|DO|PT|DPT|OT|DC|DDS|DMD|PhD|NP|PA|PA-C)\.?$/i, "").trim();
  const firstName = parts[0];

  // fuzzy match: last name contains + first name starts with
  const conditions: any[] = [
    isNull(physicians.deletedAt),
    ilike(physicians.lastName, `%${lastName.trim()}%`),
  ];
  if (firstName && firstName.trim().length > 1) {
    conditions.push(ilike(physicians.firstName, `${firstName.trim().charAt(0)}%`));
  }
  return db.select().from(physicians).where(and(...conditions)).limit(5);
}
