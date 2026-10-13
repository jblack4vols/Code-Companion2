/**
 * Marketer ROI storage — revenue attribution per MARKETER user
 * via users -> physicians (assignedOwnerId) -> physicianMonthlySummary.
 */
import { db } from "./db";
import { sql, eq, and, isNull, gte } from "drizzle-orm";
import { users, physicians, physicianMonthlySummary } from "@shared/schema";

export interface MarketerRoiRow {
  marketerId: string;
  marketerName: string;
  annualCompensation: number | null;
  travelBudget: number | null;
  totalCost: number;
  assignedPhysicians: number;
  totalReferrals: number;
  totalRevenue: number;
  revenuePerReferral: number;
  roi: number | null;
  interactionCount: number;
}

export async function getMarketerRoi(filters: {
  months?: number;
}): Promise<MarketerRoiRow[]> {
  const months = filters.months ?? 6;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;

  const rows = await db
    .select({
      marketerId: users.id,
      marketerName: users.name,
      annualCompensation: users.annualCompensation,
      travelBudget: users.travelBudget,
      assignedPhysicians: sql<number>`COUNT(DISTINCT ${physicians.id})`,
      totalReferrals: sql<number>`COALESCE(SUM(${physicianMonthlySummary.referralsCount}), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(CAST(${physicianMonthlySummary.revenueGenerated} AS NUMERIC)), 0)`,
    })
    .from(users)
    .leftJoin(physicians, and(eq(physicians.assignedOwnerId, users.id), isNull(physicians.deletedAt)))
    .leftJoin(
      physicianMonthlySummary,
      and(eq(physicianMonthlySummary.physicianId, physicians.id), gte(physicianMonthlySummary.month, cutoffStr)),
    )
    .where(eq(users.role, "MARKETER"))
    .groupBy(users.id, users.name, users.annualCompensation, users.travelBudget);

  return rows.map(r => {
    const annualComp = Number(r.annualCompensation ?? 0);
    const annualTravel = Number(r.travelBudget ?? 0);
    const comp = Math.round((annualComp / 12) * months);
    const travel = Math.round((annualTravel / 12) * months);
    const totalCost = comp + travel;
    const revenue = Number(r.totalRevenue);
    const referrals = Number(r.totalReferrals);
    return {
      marketerId: r.marketerId,
      marketerName: r.marketerName,
      annualCompensation: r.annualCompensation ? Number(r.annualCompensation) : null,
      travelBudget: r.travelBudget ? Number(r.travelBudget) : null,
      totalCost,
      assignedPhysicians: Number(r.assignedPhysicians),
      totalReferrals: referrals,
      totalRevenue: revenue,
      revenuePerReferral: referrals > 0 ? Math.round(revenue / referrals) : 0,
      roi: totalCost > 0 ? Math.round((revenue / totalCost) * 10) / 10 : null,
      interactionCount: 0,
    };
  });
}
