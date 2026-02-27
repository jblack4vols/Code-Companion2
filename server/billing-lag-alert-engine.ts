/**
 * Billing Lag Alert Engine
 * Evaluates billing cycle metrics and AR aging against thresholds.
 * Follows the same deduplication pattern as unit-economics-alert-engine.ts.
 * Called after claim/payment import — not a scheduled cron job.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { getBillingLagMetrics, getARAgingBuckets } from "./storage-billing-lag";

// Thresholds
const STALE_SUBMISSION_DAYS = 3;   // Claims not submitted within N days of DOS
const SLOW_PAYMENT_DAYS = 45;      // Claims unpaid > N days after submission
const HIGH_AR_90PLUS_AMOUNT = 50000; // Location has > $N in 90+ bucket

async function billingAlertAlreadyOpen(
  locationId: string,
  alertType: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT id FROM financial_alerts
    WHERE location_id = ${locationId}
      AND alert_type = ${alertType}
      AND acknowledged_at IS NULL
    LIMIT 1
  `);
  return result.rows.length > 0;
}

/**
 * Evaluates billing lag alerts for all active locations.
 * Creates financial_alert records for:
 *   - HIGH_BILLING_LAG: avg submission lag > 3 days
 *   - HIGH_AR_AGING: 90+ bucket > $50K
 * Returns count of new alerts created.
 */
export async function evaluateBillingLagAlerts(locationId?: string): Promise<number> {
  let alertCount = 0;

  // Fetch all active locations to scope alerts
  const locResult = await db.execute(sql`
    SELECT id, name FROM locations WHERE is_active = true
    ${locationId ? sql`AND id = ${locationId}` : sql``}
  `);
  const locations = locResult.rows as Array<{ id: string; name: string }>;

  for (const loc of locations) {
    // --- Check 1: High billing lag (avg submission > STALE_SUBMISSION_DAYS) ---
    const metrics = await getBillingLagMetrics({ locationId: loc.id });
    if (metrics.avgDaysToSubmission > STALE_SUBMISSION_DAYS && metrics.avgDaysToSubmission > 0) {
      const alreadyOpen = await billingAlertAlreadyOpen(loc.id, "HIGH_BILLING_LAG");
      if (!alreadyOpen) {
        await storage.createFinancialAlert({
          locationId: loc.id,
          alertType: "HIGH_BILLING_LAG",
          threshold: STALE_SUBMISSION_DAYS,
          actualValue: metrics.avgDaysToSubmission,
          message: `${loc.name}: Avg billing lag ${metrics.avgDaysToSubmission.toFixed(1)} days exceeds ${STALE_SUBMISSION_DAYS}-day threshold`,
          acknowledgedAt: null,
          acknowledgedBy: null,
        });
        alertCount++;
      }
    }

    // --- Check 2: High AR aging — 90+ bucket exceeds $50K ---
    const buckets = await getARAgingBuckets(loc.id);
    const bucket90Plus = buckets.find((b) => b.bucket === "90+");
    if (bucket90Plus && bucket90Plus.totalOutstanding > HIGH_AR_90PLUS_AMOUNT) {
      const alreadyOpen = await billingAlertAlreadyOpen(loc.id, "HIGH_AR_AGING");
      if (!alreadyOpen) {
        await storage.createFinancialAlert({
          locationId: loc.id,
          alertType: "HIGH_AR_AGING",
          threshold: HIGH_AR_90PLUS_AMOUNT,
          actualValue: bucket90Plus.totalOutstanding,
          message: `${loc.name}: $${bucket90Plus.totalOutstanding.toFixed(0)} in 90+ day AR bucket exceeds $${HIGH_AR_90PLUS_AMOUNT.toLocaleString()} threshold`,
          acknowledgedAt: null,
          acknowledgedBy: null,
        });
        alertCount++;
      }
    }

    // --- Check 3: Slow payment — claims unpaid > SLOW_PAYMENT_DAYS after submission ---
    const slowPayResult = await db.execute(sql`
      SELECT COUNT(*)::int AS slow_count
      FROM claims
      WHERE location_id = ${loc.id}
        AND submission_date IS NOT NULL
        AND payment_date IS NULL
        AND status IN ('SUBMITTED', 'PARTIAL')
        AND (CURRENT_DATE - submission_date::date) > ${SLOW_PAYMENT_DAYS}
    `);
    const slowCount = Number((slowPayResult.rows[0] as any)?.slow_count) || 0;
    if (slowCount > 0) {
      const alreadyOpen = await billingAlertAlreadyOpen(loc.id, "HIGH_BILLING_LAG");
      if (!alreadyOpen) {
        await storage.createFinancialAlert({
          locationId: loc.id,
          alertType: "HIGH_BILLING_LAG",
          threshold: SLOW_PAYMENT_DAYS,
          actualValue: slowCount,
          message: `${loc.name}: ${slowCount} claim(s) unpaid > ${SLOW_PAYMENT_DAYS} days after submission`,
          acknowledgedAt: null,
          acknowledgedBy: null,
        });
        alertCount++;
      }
    }
  }

  return alertCount;
}
