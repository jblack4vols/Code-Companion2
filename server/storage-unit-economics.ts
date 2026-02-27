/**
 * Unit Economics storage methods — CRUD + aggregation queries.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, and, gte, lte, desc, asc, isNull, isNotNull, sql } from "drizzle-orm";
import {
  clinicFinancials, providerProductivity, financialAlerts, financialTargets,
  locations, users,
  type ClinicFinancial, type InsertClinicFinancial,
  type ProviderProductivity, type InsertProviderProductivity,
  type FinancialAlert, type InsertFinancialAlert,
  type FinancialTarget, type InsertFinancialTarget,
} from "@shared/schema";

// ---- Exported aggregate types ----

export interface UnitEconomicsLocationSummary {
  locationId: string;
  locationName: string;
  grossRevenue: number;
  totalVisits: number;
  revenuePerVisit: number;
  costPerVisit: number;
  laborPercent: number;
  netMargin: number;
  netContribution: number;
  activeAlerts: number;
}

export interface UnitEconomicsLocationDetail {
  location: { id: string; name: string; city: string; state: string };
  currentPeriod: UnitEconomicsLocationSummary | null;
  trends: Array<{
    periodDate: string;
    grossRevenue: number;
    totalVisits: number;
    revenuePerVisit: number;
    costPerVisit: number;
    laborPercent: number;
    netContribution: number;
  }>;
  providers: ProviderProductivityEntry[];
}

export interface ProviderProductivityEntry {
  userId: string;
  userName: string;
  locationName: string;
  totalVisits: number;
  totalUnits: number;
  unitsPerHour: number;
  hoursWorked: number;
  revenueGenerated: number;
  revenueTarget: number;
  targetAttainment: number;
}

export interface ForecastEntry {
  locationId: string;
  locationName: string;
  forecastRevenue: number;
  forecastVisits: number;
  forecastRevenuePerVisit: number;
  trendDirection: "up" | "down" | "flat";
  confidenceScore: number;
}

// ---- Simple linear regression helpers ----

function linearRegression(points: number[]): { slope: number; rSquared: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, rSquared: 0 };
  const xs = points.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((a, b) => a + b, 0) / n;
  const ssXY = xs.reduce((sum, x, i) => sum + (x - meanX) * (points[i] - meanY), 0);
  const ssXX = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const ssYY = points.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const rSquared = ssXX === 0 || ssYY === 0 ? 0 : (ssXY ** 2) / (ssXX * ssYY);
  return { slope, rSquared };
}

// ---- Clinic Financials ----

export async function getClinicFinancials(filters: {
  locationId?: string;
  periodType?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ClinicFinancial[]> {
  const conditions: any[] = [];
  if (filters.locationId) conditions.push(eq(clinicFinancials.locationId, filters.locationId));
  if (filters.periodType) conditions.push(eq(clinicFinancials.periodType, filters.periodType as any));
  if (filters.dateFrom) conditions.push(gte(clinicFinancials.periodDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(clinicFinancials.periodDate, filters.dateTo));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(clinicFinancials).where(where).orderBy(desc(clinicFinancials.periodDate));
}

export async function upsertClinicFinancial(data: InsertClinicFinancial): Promise<ClinicFinancial> {
  const [row] = await db.insert(clinicFinancials)
    .values(data)
    .onConflictDoUpdate({
      target: [clinicFinancials.locationId, clinicFinancials.periodDate, clinicFinancials.periodType],
      set: {
        grossRevenue: data.grossRevenue,
        totalVisits: data.totalVisits,
        totalUnits: data.totalUnits,
        laborCost: data.laborCost,
        rentCost: data.rentCost,
        suppliesCost: data.suppliesCost,
        otherFixedCosts: data.otherFixedCosts,
        netContribution: data.netContribution,
        source: data.source,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function bulkUpsertClinicFinancials(rows: InsertClinicFinancial[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await db.select({ id: clinicFinancials.id })
      .from(clinicFinancials)
      .where(and(
        eq(clinicFinancials.locationId, row.locationId),
        eq(clinicFinancials.periodDate, row.periodDate),
        eq(clinicFinancials.periodType, row.periodType ?? "WEEKLY"),
      ))
      .limit(1);
    await upsertClinicFinancial(row);
    if (existing.length > 0) updated++; else inserted++;
  }
  return { inserted, updated };
}

// ---- Provider Productivity ----

export async function getProviderProductivity(filters: {
  userId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ProviderProductivity[]> {
  const conditions: any[] = [];
  if (filters.userId) conditions.push(eq(providerProductivity.userId, filters.userId));
  if (filters.locationId) conditions.push(eq(providerProductivity.locationId, filters.locationId));
  if (filters.dateFrom) conditions.push(gte(providerProductivity.weekStartDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(providerProductivity.weekStartDate, filters.dateTo));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(providerProductivity).where(where).orderBy(desc(providerProductivity.weekStartDate));
}

export async function upsertProviderProductivity(data: InsertProviderProductivity): Promise<ProviderProductivity> {
  const [row] = await db.insert(providerProductivity)
    .values(data)
    .onConflictDoUpdate({
      target: [providerProductivity.userId, providerProductivity.locationId, providerProductivity.weekStartDate],
      set: {
        totalVisits: data.totalVisits,
        totalUnits: data.totalUnits,
        unitsPerHour: data.unitsPerHour,
        hoursWorked: data.hoursWorked,
        revenueGenerated: data.revenueGenerated,
        revenueTarget: data.revenueTarget,
      },
    })
    .returning();
  return row;
}

export async function bulkUpsertProviderProductivity(rows: InsertProviderProductivity[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await db.select({ id: providerProductivity.id })
      .from(providerProductivity)
      .where(and(
        eq(providerProductivity.userId, row.userId),
        eq(providerProductivity.locationId, row.locationId),
        eq(providerProductivity.weekStartDate, row.weekStartDate),
      ))
      .limit(1);
    await upsertProviderProductivity(row);
    if (existing.length > 0) updated++; else inserted++;
  }
  return { inserted, updated };
}

// ---- Financial Alerts ----

export async function getFinancialAlerts(filters: {
  locationId?: string;
  acknowledged?: boolean;
}): Promise<FinancialAlert[]> {
  const conditions: any[] = [];
  if (filters.locationId) conditions.push(eq(financialAlerts.locationId, filters.locationId));
  if (filters.acknowledged === true) conditions.push(isNotNull(financialAlerts.acknowledgedAt));
  if (filters.acknowledged === false) conditions.push(isNull(financialAlerts.acknowledgedAt));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(financialAlerts).where(where).orderBy(desc(financialAlerts.triggeredAt));
}

export async function createFinancialAlert(alert: InsertFinancialAlert): Promise<FinancialAlert> {
  const [row] = await db.insert(financialAlerts).values(alert).returning();
  return row;
}

export async function acknowledgeFinancialAlert(id: string, userId: string): Promise<FinancialAlert | undefined> {
  const [row] = await db.update(financialAlerts)
    .set({ acknowledgedAt: new Date(), acknowledgedBy: userId })
    .where(eq(financialAlerts.id, id))
    .returning();
  return row;
}

// ---- Financial Targets ----

export async function getFinancialTargets(locationId?: string): Promise<FinancialTarget[]> {
  const where = locationId ? eq(financialTargets.locationId, locationId) : undefined;
  return db.select().from(financialTargets).where(where).orderBy(asc(financialTargets.metricName));
}

export async function upsertFinancialTarget(data: InsertFinancialTarget): Promise<FinancialTarget> {
  const [row] = await db.insert(financialTargets)
    .values(data)
    .onConflictDoUpdate({
      target: [financialTargets.locationId, financialTargets.metricName],
      set: {
        targetValue: data.targetValue,
        warningThreshold: data.warningThreshold,
        criticalThreshold: data.criticalThreshold,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

// ---- Aggregation Queries ----

export async function getUnitEconomicsDashboard(locationIds?: string[]): Promise<UnitEconomicsLocationSummary[]> {
  // Build optional IN clause for location scoping
  const locationFilter = locationIds && locationIds.length > 0
    ? sql`AND l.id = ANY(${locationIds}::uuid[])`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      l.id as location_id,
      l.name as location_name,
      COALESCE(SUM(cf.gross_revenue), 0)::float as gross_revenue,
      COALESCE(SUM(cf.total_visits), 0)::int as total_visits,
      CASE WHEN SUM(cf.total_visits) > 0
        THEN ROUND(SUM(cf.gross_revenue)::numeric / SUM(cf.total_visits), 2)
        ELSE 0 END::float as revenue_per_visit,
      CASE WHEN SUM(cf.total_visits) > 0
        THEN ROUND((COALESCE(SUM(cf.labor_cost),0) + COALESCE(SUM(cf.rent_cost),0) + COALESCE(SUM(cf.supplies_cost),0) + COALESCE(SUM(cf.other_fixed_costs),0))::numeric / SUM(cf.total_visits), 2)
        ELSE 0 END::float as cost_per_visit,
      CASE WHEN SUM(cf.gross_revenue) > 0
        THEN ROUND(COALESCE(SUM(cf.labor_cost),0)::numeric / SUM(cf.gross_revenue) * 100, 1)
        ELSE 0 END::float as labor_percent,
      CASE WHEN SUM(cf.gross_revenue) > 0
        THEN ROUND(COALESCE(SUM(cf.net_contribution),0)::numeric / SUM(cf.gross_revenue) * 100, 1)
        ELSE 0 END::float as net_margin,
      COALESCE(SUM(cf.net_contribution), 0)::float as net_contribution,
      COALESCE(alert_counts.active_alerts, 0)::int as active_alerts
    FROM locations l
    LEFT JOIN clinic_financials cf ON cf.location_id = l.id
      AND cf.period_date >= (CURRENT_DATE - INTERVAL '30 days')
    LEFT JOIN (
      SELECT location_id, COUNT(*) as active_alerts
      FROM financial_alerts
      WHERE acknowledged_at IS NULL
      GROUP BY location_id
    ) alert_counts ON alert_counts.location_id = l.id
    WHERE l.is_active = true ${locationFilter}
    GROUP BY l.id, l.name, alert_counts.active_alerts
    ORDER BY gross_revenue DESC
  `);

  return rows.rows.map((r: any) => ({
    locationId: r.location_id,
    locationName: r.location_name,
    grossRevenue: parseFloat(r.gross_revenue),
    totalVisits: parseInt(r.total_visits),
    revenuePerVisit: parseFloat(r.revenue_per_visit),
    costPerVisit: parseFloat(r.cost_per_visit),
    laborPercent: parseFloat(r.labor_percent),
    netMargin: parseFloat(r.net_margin),
    netContribution: parseFloat(r.net_contribution),
    activeAlerts: parseInt(r.active_alerts),
  }));
}

export async function getUnitEconomicsLocationDetail(
  locationId: string, dateFrom?: string, dateTo?: string
): Promise<UnitEconomicsLocationDetail> {
  const [loc] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!loc) throw new Error("Location not found");

  // Time series trends
  const conditions: any[] = [eq(clinicFinancials.locationId, locationId)];
  if (dateFrom) conditions.push(gte(clinicFinancials.periodDate, dateFrom));
  if (dateTo) conditions.push(lte(clinicFinancials.periodDate, dateTo));
  const rows = await db.select().from(clinicFinancials)
    .where(and(...conditions))
    .orderBy(asc(clinicFinancials.periodDate));

  const trends = rows.map(r => {
    const gross = parseFloat(String(r.grossRevenue));
    const visits = r.totalVisits || 0;
    const labor = parseFloat(String(r.laborCost));
    const totalCost = parseFloat(String(r.laborCost)) + parseFloat(String(r.rentCost)) +
      parseFloat(String(r.suppliesCost)) + parseFloat(String(r.otherFixedCosts));
    return {
      periodDate: String(r.periodDate),
      grossRevenue: gross,
      totalVisits: visits,
      revenuePerVisit: visits > 0 ? Math.round((gross / visits) * 100) / 100 : 0,
      costPerVisit: visits > 0 ? Math.round((totalCost / visits) * 100) / 100 : 0,
      laborPercent: gross > 0 ? Math.round((labor / gross) * 1000) / 10 : 0,
      netContribution: parseFloat(String(r.netContribution)),
    };
  });

  // Current period summary (last 30 days)
  const dashboard = await getUnitEconomicsDashboard();
  const currentPeriod = dashboard.find(d => d.locationId === locationId) || null;

  // Provider productivity for this location
  const providers = await getProviderProductivityLeaderboard(dateFrom, dateTo, locationId);

  return {
    location: { id: loc.id, name: loc.name, city: loc.city || "", state: loc.state || "" },
    currentPeriod,
    trends,
    providers,
  };
}

export async function getProviderProductivityLeaderboard(
  dateFrom?: string, dateTo?: string, locationId?: string
): Promise<ProviderProductivityEntry[]> {
  const conditions: any[] = [];
  if (locationId) conditions.push(eq(providerProductivity.locationId, locationId));
  if (dateFrom) conditions.push(gte(providerProductivity.weekStartDate, dateFrom));
  if (dateTo) conditions.push(lte(providerProductivity.weekStartDate, dateTo));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db.select({
    userId: providerProductivity.userId,
    locationId: providerProductivity.locationId,
    totalVisits: sql<number>`SUM(${providerProductivity.totalVisits})`,
    totalUnits: sql<number>`SUM(${providerProductivity.totalUnits})`,
    unitsPerHour: sql<number>`AVG(${providerProductivity.unitsPerHour})`,
    hoursWorked: sql<number>`SUM(${providerProductivity.hoursWorked})`,
    revenueGenerated: sql<number>`SUM(${providerProductivity.revenueGenerated})`,
    revenueTarget: sql<number>`SUM(${providerProductivity.revenueTarget})`,
    userName: users.name,
    locationName: locations.name,
  })
    .from(providerProductivity)
    .innerJoin(users, eq(providerProductivity.userId, users.id))
    .innerJoin(locations, eq(providerProductivity.locationId, locations.id))
    .where(where)
    .groupBy(providerProductivity.userId, providerProductivity.locationId, users.name, locations.name)
    .orderBy(desc(sql`SUM(${providerProductivity.revenueGenerated})`));

  return rows.map(r => {
    const rev = parseFloat(String(r.revenueGenerated));
    const target = parseFloat(String(r.revenueTarget)) || 0;
    return {
      userId: r.userId,
      userName: r.userName,
      locationName: r.locationName,
      totalVisits: Number(r.totalVisits),
      totalUnits: Number(r.totalUnits),
      unitsPerHour: parseFloat(String(r.unitsPerHour)) || 0,
      hoursWorked: parseFloat(String(r.hoursWorked)) || 0,
      revenueGenerated: rev,
      revenueTarget: target,
      targetAttainment: target > 0 ? Math.round((rev / target) * 1000) / 10 : 0,
    };
  });
}

export async function getUnitEconomicsForecast(locationId?: string): Promise<ForecastEntry[]> {
  const locCondition = locationId ? sql` AND cf.location_id = ${locationId}` : sql``;
  const result = await db.execute(sql`
    SELECT cf.location_id, l.name as location_name,
      cf.period_date, cf.gross_revenue::float, cf.total_visits
    FROM clinic_financials cf
    JOIN locations l ON l.id = cf.location_id
    WHERE cf.period_type = 'WEEKLY'
      AND cf.period_date >= CURRENT_DATE - INTERVAL '8 weeks'
      ${locCondition}
    ORDER BY cf.location_id, cf.period_date
  `);

  // Group by location
  const byLocation = new Map<string, { name: string; revenues: number[]; visits: number[] }>();
  for (const r of result.rows as any[]) {
    if (!byLocation.has(r.location_id)) {
      byLocation.set(r.location_id, { name: r.location_name, revenues: [], visits: [] });
    }
    const entry = byLocation.get(r.location_id)!;
    entry.revenues.push(parseFloat(r.gross_revenue));
    entry.visits.push(parseInt(r.total_visits));
  }

  const forecasts: ForecastEntry[] = [];
  for (const [locId, data] of Array.from(byLocation.entries())) {
    const revReg = linearRegression(data.revenues);
    const visitReg = linearRegression(data.visits);
    const n = data.revenues.length;
    const forecastRevenue = Math.max(0, (data.revenues[n - 1] || 0) + revReg.slope * 4);
    const forecastVisits = Math.max(0, Math.round((data.visits[n - 1] || 0) + visitReg.slope * 4));
    const forecastRevenuePerVisit = forecastVisits > 0 ? Math.round((forecastRevenue / forecastVisits) * 100) / 100 : 0;
    const trendDirection: "up" | "down" | "flat" =
      revReg.slope > 50 ? "up" : revReg.slope < -50 ? "down" : "flat";
    forecasts.push({
      locationId: locId,
      locationName: data.name,
      forecastRevenue: Math.round(forecastRevenue * 100) / 100,
      forecastVisits,
      forecastRevenuePerVisit,
      trendDirection,
      confidenceScore: Math.round(revReg.rSquared * 100),
    });
  }
  return forecasts.sort((a, b) => b.forecastRevenue - a.forecastRevenue);
}
