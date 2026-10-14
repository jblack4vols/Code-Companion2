/**
 * Referral-to-claims linking — joins referrals.patientAccountNumber to claims.patientAccountNumber
 * to show actual collected revenue per referral instead of estimates.
 * Claims are pre-aggregated per account number so referral rows are never multiplied by the join.
 */
import { db } from "./db";
import { eq, and, sql, isNull, isNotNull, inArray, desc } from "drizzle-orm";
import { referrals, claims, physicians } from "@shared/schema";

export interface ReferralClaimsLink {
  referralId: string;
  patientAccountNumber: string;
  patientFullName: string | null;
  physicianId: string | null;
  physicianName: string | null;
  referralDate: string;
  locationId: string;
  valueEstimate: number | null;
  totalBilled: number;
  totalPaid: number;
  totalDenied: number;
  claimCount: number;
}

interface LinkFilters {
  locationId?: string;
  locationIds?: string[] | null;
  physicianId?: string;
  page?: number;
  pageSize?: number;
}

function claimTotalsByAccount() {
  return db
    .select({
      account: claims.patientAccountNumber,
      billed: sql<string>`COALESCE(SUM(CAST(${claims.billedAmount} AS NUMERIC)), 0)`.as("billed"),
      paid: sql<string>`COALESCE(SUM(CAST(${claims.paidAmount} AS NUMERIC)), 0)`.as("paid"),
      denied: sql<string>`COUNT(CASE WHEN ${claims.status} = 'DENIED' THEN 1 END)`.as("denied"),
      cnt: sql<string>`COUNT(*)`.as("cnt"),
    })
    .from(claims)
    .where(isNotNull(claims.patientAccountNumber))
    .groupBy(claims.patientAccountNumber)
    .as("claim_totals");
}

function referralConditions(filters: LinkFilters) {
  const conditions = [isNull(referrals.deletedAt)];
  if (filters.locationIds) conditions.push(inArray(referrals.locationId, filters.locationIds));
  if (filters.locationId) conditions.push(eq(referrals.locationId, filters.locationId));
  if (filters.physicianId) conditions.push(eq(referrals.physicianId, filters.physicianId));
  return conditions;
}

export async function getReferralClaimsLinked(
  filters: LinkFilters,
): Promise<{ data: ReferralClaimsLink[]; total: number }> {
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 50, 1), 200);
  const totals = claimTotalsByAccount();
  const conditions = [...referralConditions(filters), isNotNull(referrals.patientAccountNumber)];

  const [rows, countResult] = await Promise.all([
    db
      .select({
        referralId: referrals.id,
        patientAccountNumber: referrals.patientAccountNumber,
        patientFullName: referrals.patientFullName,
        physicianId: referrals.physicianId,
        physicianName: sql<string>`COALESCE(${physicians.firstName} || ' ' || ${physicians.lastName}, '')`,
        referralDate: referrals.referralDate,
        locationId: referrals.locationId,
        valueEstimate: referrals.valueEstimate,
        totalBilled: sql<string>`COALESCE(${totals.billed}, 0)`,
        totalPaid: sql<string>`COALESCE(${totals.paid}, 0)`,
        totalDenied: sql<string>`COALESCE(${totals.denied}, 0)`,
        claimCount: sql<string>`COALESCE(${totals.cnt}, 0)`,
      })
      .from(referrals)
      .leftJoin(totals, eq(referrals.patientAccountNumber, totals.account))
      .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
      .where(and(...conditions))
      .orderBy(desc(referrals.referralDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<string>`COUNT(*)` }).from(referrals).where(and(...conditions)),
  ]);

  const data: ReferralClaimsLink[] = rows.map((r) => ({
    referralId: r.referralId,
    patientAccountNumber: r.patientAccountNumber ?? "",
    patientFullName: r.patientFullName,
    physicianId: r.physicianId,
    physicianName: r.physicianName,
    referralDate: r.referralDate,
    locationId: r.locationId,
    valueEstimate: r.valueEstimate,
    totalBilled: Number(r.totalBilled),
    totalPaid: Number(r.totalPaid),
    totalDenied: Number(r.totalDenied),
    claimCount: Number(r.claimCount),
  }));
  return { data, total: Number(countResult[0]?.count ?? 0) };
}

export async function getReferralClaimsSummary(filters: {
  locationId?: string;
  locationIds?: string[] | null;
}) {
  const totals = claimTotalsByAccount();
  const result = await db
    .select({
      totalReferrals: sql<string>`COUNT(*)`,
      linkedReferrals: sql<string>`COUNT(${totals.account})`,
      totalEstimated: sql<string>`COALESCE(SUM(${referrals.valueEstimate}) FILTER (WHERE ${totals.account} IS NOT NULL), 0)`,
      totalCollected: sql<string>`COALESCE(SUM(${totals.paid}), 0)`,
    })
    .from(referrals)
    .leftJoin(totals, eq(referrals.patientAccountNumber, totals.account))
    .where(and(...referralConditions(filters)));

  const row = result[0];
  const estimated = Number(row?.totalEstimated ?? 0);
  const collected = Number(row?.totalCollected ?? 0);
  return {
    totalReferrals: Number(row?.totalReferrals ?? 0),
    linkedReferrals: Number(row?.linkedReferrals ?? 0),
    totalEstimated: estimated,
    totalCollected: collected,
    accuracyGap: estimated > 0 ? Math.round(((collected - estimated) / estimated) * 100) : 0,
  };
}
