/**
 * Billing Lag Tracker — breakdown queries by payer and location.
 * Companion to storage-billing-lag.ts.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import type { PayerLagStat, LocationLagStat } from "./storage-billing-lag-types";

export type { PayerLagStat, LocationLagStat } from "./storage-billing-lag-types";

// ---- Billing Lag by Payer ----

export async function getBillingLagByPayer(filters: {
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<PayerLagStat[]> {
  const conditions: ReturnType<typeof sql>[] = [];
  if (filters.locationId) conditions.push(sql`c.location_id = ${filters.locationId}`);
  if (filters.dateFrom) conditions.push(sql`c.dos >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(sql`c.dos <= ${filters.dateTo}`);
  const where = conditions.length > 0
    ? sql`AND ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      c.payer,
      COUNT(*)::int AS claim_count,
      ROUND(AVG(
        CASE WHEN c.submission_date IS NOT NULL
          THEN c.submission_date::date - c.dos::date END
      )::numeric, 1)::float AS avg_days_to_submission,
      ROUND(AVG(
        CASE WHEN c.payment_date IS NOT NULL AND c.submission_date IS NOT NULL
          THEN c.payment_date::date - c.submission_date::date END
      )::numeric, 1)::float AS avg_days_to_payment,
      ROUND(AVG(
        CASE WHEN c.payment_date IS NOT NULL
          THEN c.payment_date::date - c.dos::date END
      )::numeric, 1)::float AS avg_cycle_time,
      COALESCE(SUM(
        CASE WHEN c.status IN ('SUBMITTED', 'PARTIAL')
          THEN c.billed_amount - COALESCE(c.paid_amount, 0) ELSE 0 END
      ), 0)::float AS total_outstanding
    FROM claims c
    WHERE c.payer IS NOT NULL ${where}
    GROUP BY c.payer
    ORDER BY claim_count DESC
  `);

  return (result.rows as any[]).map((r) => ({
    payer: r.payer,
    claimCount: Number(r.claim_count),
    avgDaysToSubmission: parseFloat(r.avg_days_to_submission) || 0,
    avgDaysToPayment: parseFloat(r.avg_days_to_payment) || 0,
    avgCycleTime: parseFloat(r.avg_cycle_time) || 0,
    totalOutstanding: parseFloat(r.total_outstanding),
  }));
}

// ---- Billing Lag by Location ----

export async function getBillingLagByLocation(filters: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<LocationLagStat[]> {
  const conditions: ReturnType<typeof sql>[] = [];
  if (filters.dateFrom) conditions.push(sql`c.dos >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(sql`c.dos <= ${filters.dateTo}`);
  const where = conditions.length > 0
    ? sql`AND ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      c.location_id,
      l.name AS location_name,
      COUNT(*)::int AS claim_count,
      ROUND(AVG(
        CASE WHEN c.submission_date IS NOT NULL
          THEN c.submission_date::date - c.dos::date END
      )::numeric, 1)::float AS avg_days_to_submission,
      ROUND(AVG(
        CASE WHEN c.payment_date IS NOT NULL AND c.submission_date IS NOT NULL
          THEN c.payment_date::date - c.submission_date::date END
      )::numeric, 1)::float AS avg_days_to_payment,
      ROUND(AVG(
        CASE WHEN c.payment_date IS NOT NULL
          THEN c.payment_date::date - c.dos::date END
      )::numeric, 1)::float AS avg_cycle_time,
      COALESCE(SUM(
        CASE WHEN c.status IN ('SUBMITTED', 'PARTIAL')
          THEN c.billed_amount - COALESCE(c.paid_amount, 0) ELSE 0 END
      ), 0)::float AS total_outstanding
    FROM claims c
    JOIN locations l ON l.id = c.location_id
    WHERE c.location_id IS NOT NULL ${where}
    GROUP BY c.location_id, l.name
    ORDER BY claim_count DESC
  `);

  return (result.rows as any[]).map((r) => ({
    locationId: r.location_id,
    locationName: r.location_name,
    claimCount: Number(r.claim_count),
    avgDaysToSubmission: parseFloat(r.avg_days_to_submission) || 0,
    avgDaysToPayment: parseFloat(r.avg_days_to_payment) || 0,
    avgCycleTime: parseFloat(r.avg_cycle_time) || 0,
    totalOutstanding: parseFloat(r.total_outstanding),
  }));
}
