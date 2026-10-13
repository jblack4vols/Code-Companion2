/**
 * Marketer ROI storage — revenue attribution per MARKETER user
 * via users -> physicians (assignedOwnerId) -> physicianMonthlySummary.
 */
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
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
    .leftJoin(physicians, eq(physicians.assignedOwnerId, users.id))
    .leftJoin(physicianMonthlySummary, eq(physicianMonthlySummary.physicianId, physicians.id))
    .where(eq(users.role, "MARKETER"))
    .groupBy(users.id, users.name, users.annualCompensation, users.travelBudget);

  return rows.map(r => {
    const comp = Number(r.annualCompensation ?? 0);
    const travel = Number(r.travelBudget ?? 0);
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
