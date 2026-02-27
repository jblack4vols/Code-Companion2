/**
 * Billing Lag Tracker — core storage methods.
 * AR aging buckets, overall metrics, and stale claims detection.
 * Breakdown queries (by-payer, by-location) are in storage-billing-lag-breakdowns.ts.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import type {
  ARAgingBucket,
  BillingLagMetrics,
  StaleClaim,
} from "./storage-billing-lag-types";

export type {
  ARAgingBucket,
  BillingLagMetrics,
  StaleClaim,
} from "./storage-billing-lag-types";

export type {
  PayerLagStat,
  LocationLagStat,
} from "./storage-billing-lag-types";

// ---- AR Aging Buckets ----

/**
 * Groups unpaid/partial claims into 0-30, 31-60, 61-90, 90+ day buckets.
 * Days measured from DOS for unpaid claims.
 */
export async function getARAgingBuckets(locationId?: string): Promise<ARAgingBucket[]> {
  const locationFilter = locationId
    ? sql`AND c.location_id = ${locationId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      CASE
        WHEN CURRENT_DATE - c.dos::date <= 30 THEN '0-30'
        WHEN CURRENT_DATE - c.dos::date <= 60 THEN '31-60'
        WHEN CURRENT_DATE - c.dos::date <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket,
      COUNT(*)::int AS claim_count,
      COALESCE(SUM(c.billed_amount), 0)::float AS total_billed,
      COALESCE(SUM(c.billed_amount - COALESCE(c.paid_amount, 0)), 0)::float AS total_outstanding
    FROM claims c
    WHERE c.status IN ('SUBMITTED', 'PARTIAL')
      ${locationFilter}
    GROUP BY bucket
    ORDER BY bucket
  `);

  return (result.rows as any[]).map((r) => ({
    bucket: r.bucket,
    claimCount: Number(r.claim_count),
    totalBilled: parseFloat(r.total_billed),
    totalOutstanding: parseFloat(r.total_outstanding),
  }));
}

// ---- Billing Lag Metrics ----

/**
 * Overall billing cycle metrics: avg days DOS→submission, submission→payment, full cycle.
 */
export async function getBillingLagMetrics(filters: {
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BillingLagMetrics> {
  const conditions: ReturnType<typeof sql>[] = [];
  if (filters.locationId) conditions.push(sql`c.location_id = ${filters.locationId}`);
  if (filters.dateFrom) conditions.push(sql`c.dos >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(sql`c.dos <= ${filters.dateTo}`);
  const where = conditions.length > 0
    ? sql`AND ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
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
      )::numeric, 1)::float AS avg_total_cycle,
      COUNT(*) FILTER (WHERE c.status IN ('SUBMITTED', 'PARTIAL'))::int AS outstanding_claims,
      COALESCE(SUM(
        CASE WHEN c.status IN ('SUBMITTED', 'PARTIAL')
          THEN c.billed_amount - COALESCE(c.paid_amount, 0) ELSE 0 END
      ), 0)::float AS outstanding_amount
    FROM claims c
    WHERE 1=1 ${where}
  `);

  const r = (result.rows as any[])[0] || {};
  return {
    avgDaysToSubmission: parseFloat(r.avg_days_to_submission) || 0,
    avgDaysToPayment: parseFloat(r.avg_days_to_payment) || 0,
    avgTotalCycleTime: parseFloat(r.avg_total_cycle) || 0,
    totalOutstandingClaims: Number(r.outstanding_claims) || 0,
    totalOutstandingAmount: parseFloat(r.outstanding_amount) || 0,
  };
}

// ---- Stale Claims ----

/**
 * Returns claims not yet submitted after `thresholdDays` from DOS.
 */
export async function getStaleClaims(thresholdDays = 7): Promise<StaleClaim[]> {
  const result = await db.execute(sql`
    SELECT
      c.id AS claim_id,
      c.claim_number,
      c.dos::text,
      c.payer,
      c.billed_amount::float AS billed_amount,
      (CURRENT_DATE - c.dos::date)::int AS days_since_dos,
      c.location_id
    FROM claims c
    WHERE c.submission_date IS NULL
      AND (CURRENT_DATE - c.dos::date) > ${thresholdDays}
      AND c.status NOT IN ('PAID', 'VOID', 'DENIED')
    ORDER BY days_since_dos DESC
    LIMIT 500
  `);

  return (result.rows as any[]).map((r) => ({
    claimId: r.claim_id,
    claimNumber: r.claim_number,
    dos: r.dos,
    payer: r.payer || "",
    billedAmount: parseFloat(r.billed_amount) || 0,
    daysSinceDos: Number(r.days_since_dos),
    locationId: r.location_id,
  }));
}
