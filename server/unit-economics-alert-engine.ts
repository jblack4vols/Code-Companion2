/**
 * Unit Economics Alert Engine
 * Evaluates financial metrics against targets and creates alerts for violations.
 * Called after data import — not a scheduled cron job.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import type { InsertFinancialAlert } from "@shared/schema";

interface AlertRule {
  alertType: InsertFinancialAlert["alertType"];
  metricName: string;
  defaultThreshold: number;
  comparison: "lt" | "gt";
  messageTemplate: (location: string, actual: number, threshold: number) => string;
}

const LOCATION_ALERT_RULES: AlertRule[] = [
  {
    alertType: "LOW_REVENUE_PER_VISIT",
    metricName: "revenue_per_visit",
    defaultThreshold: 95,
    comparison: "lt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Revenue/visit $${actual.toFixed(0)} below $${thresh} threshold`,
  },
  {
    alertType: "HIGH_COST_PER_VISIT",
    metricName: "cost_per_visit",
    defaultThreshold: 92,
    comparison: "gt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Cost/visit $${actual.toFixed(0)} exceeds $${thresh} threshold`,
  },
  {
    alertType: "HIGH_LABOR_PERCENT",
    metricName: "labor_percent",
    defaultThreshold: 57.5,
    comparison: "gt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Labor ${actual.toFixed(1)}% exceeds ${thresh}% threshold`,
  },
];

function getMetricValue(summary: Record<string, number>, metricName: string): number {
  const map: Record<string, string> = {
    revenue_per_visit: "revenuePerVisit",
    cost_per_visit: "costPerVisit",
    labor_percent: "laborPercent",
  };
  return summary[map[metricName] ?? metricName] ?? 0;
}

async function alertAlreadyOpen(locationId: string, alertType: string): Promise<boolean> {
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
 * Evaluate location-level financial alerts for all active locations (or a single one).
 * Skips duplicate unacknowledged alerts of the same type+location.
 * Returns the number of new alerts created.
 */
export async function evaluateAlerts(locationId?: string): Promise<number> {
  const dashboard = await storage.getUnitEconomicsDashboard();
  const targets = await storage.getFinancialTargets();
  let alertsCreated = 0;

  for (const locSummary of dashboard) {
    if (locationId && locSummary.locationId !== locationId) continue;

    for (const rule of LOCATION_ALERT_RULES) {
      const target = targets.find(
        t => t.metricName === rule.metricName &&
          (t.locationId === locSummary.locationId || t.locationId === null)
      );
      const threshold = target?.criticalThreshold ?? rule.defaultThreshold;
      const actual = getMetricValue(locSummary as unknown as Record<string, number>, rule.metricName);

      // Only fire alerts when there's real data (actual > 0)
      if (actual <= 0) continue;

      const triggered = rule.comparison === "lt" ? actual < threshold : actual > threshold;
      if (!triggered) continue;

      const alreadyOpen = await alertAlreadyOpen(locSummary.locationId, rule.alertType);
      if (alreadyOpen) continue;

      await storage.createFinancialAlert({
        locationId: locSummary.locationId,
        alertType: rule.alertType,
        threshold,
        actualValue: actual,
        message: rule.messageTemplate(locSummary.locationName, actual, threshold),
        acknowledgedAt: null,
        acknowledgedBy: null,
      });
      alertsCreated++;
    }
  }

  return alertsCreated;
}

/**
 * Evaluate provider-level revenue alerts.
 * Checks provider_productivity for providers below $5,700/week revenue target.
 * Returns the number of new alerts created.
 */
export async function evaluateProviderAlerts(): Promise<number> {
  const DEFAULT_WEEKLY_TARGET = 5700;
  const leaderboard = await storage.getProviderProductivityLeaderboard();
  const targets = await storage.getFinancialTargets();
  let alertsCreated = 0;

  for (const provider of leaderboard) {
    const providerTarget = targets.find(
      t => t.metricName === "provider_weekly_revenue" &&
        (t.locationId === provider.locationName || t.locationId === null)
    );
    const threshold = providerTarget?.criticalThreshold ?? DEFAULT_WEEKLY_TARGET;

    if (provider.revenueGenerated <= 0) continue;
    if (provider.revenueGenerated >= threshold) continue;

    // Use location-based dedup for provider alerts (provider per location)
    const result = await db.execute(sql`
      SELECT id FROM financial_alerts
      WHERE location_id = (
        SELECT id FROM locations WHERE name = ${provider.locationName} LIMIT 1
      )
      AND alert_type = 'LOW_PROVIDER_REVENUE'
      AND acknowledged_at IS NULL
      AND message LIKE ${"%" + provider.userName + "%"}
      LIMIT 1
    `);
    if (result.rows.length > 0) continue;

    const locationRow = await db.execute(sql`
      SELECT id FROM locations WHERE name = ${provider.locationName} LIMIT 1
    `);
    if (!locationRow.rows.length) continue;
    const locId = (locationRow.rows[0] as any).id as string;

    await storage.createFinancialAlert({
      locationId: locId,
      alertType: "LOW_PROVIDER_REVENUE",
      threshold,
      actualValue: provider.revenueGenerated,
      message: `${provider.userName} at ${provider.locationName}: Revenue $${provider.revenueGenerated.toFixed(0)} below $${threshold} target`,
      acknowledgedAt: null,
      acknowledgedBy: null,
    });
    alertsCreated++;
  }

  return alertsCreated;
}
