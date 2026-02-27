/**
 * Denial Intelligence storage methods — aggregation queries for denial analysis.
 * Split from storage-revenue-recovery.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

// ---- Exported aggregate types ----

export interface DenialSummary {
  totalClaims: number;
  deniedClaims: number;
  denialRate: number;
  totalBilledAtRisk: number;
  appealedClaims: number;
  wonAppeals: number;
  appealSuccessRate: number;
}

export interface DenialCodeStat {
  code: string;
  occurrences: number;
  totalBilledAtRisk: number;
  payers: string[];
}

export interface ProviderDenialOutlier {
  providerId: string;
  providerName: string;
  totalClaims: number;
  deniedClaims: number;
  denialRate: number;
  avgDenialRate: number;
}

export interface DenialTrend {
  month: string;
  totalClaims: number;
  deniedClaims: number;
  denialRate: number;
  totalBilledAtRisk: number;
}

// ---- Denial Aggregation Queries ----

export async function getDenialSummary(filters: {
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<DenialSummary> {
  const conditions: string[] = [];
  if (filters.locationId) conditions.push(`c.location_id = '${filters.locationId}'`);
  if (filters.dateFrom) conditions.push(`c.dos >= '${filters.dateFrom}'`);
  if (filters.dateTo) conditions.push(`c.dos <= '${filters.dateTo}'`);
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const claimsResult = await db.execute(sql.raw(`
    SELECT
      COUNT(*)::int AS total_claims,
      COUNT(CASE WHEN c.status = 'DENIED' THEN 1 END)::int AS denied_claims,
      ROUND(
        COUNT(CASE WHEN c.status = 'DENIED' THEN 1 END)::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
      )::float AS denial_rate,
      SUM(CASE WHEN c.status = 'DENIED' THEN COALESCE(c.billed_amount, 0) ELSE 0 END)::float AS total_billed_at_risk
    FROM claims c
    ${whereClause}
  `));

  const appealResult = await db.execute(sql.raw(`
    SELECT
      COUNT(*)::int AS appealed_claims,
      COUNT(CASE WHEN a.status = 'WON' THEN 1 END)::int AS won_appeals
    FROM appeals a
    JOIN claims c ON c.id = a.claim_id
    ${whereClause}
  `));

  const cr = claimsResult.rows[0] as any;
  const ar = appealResult.rows[0] as any;
  const appealed = parseInt(ar?.appealed_claims ?? 0);
  const won = parseInt(ar?.won_appeals ?? 0);

  return {
    totalClaims: parseInt(cr?.total_claims ?? 0),
    deniedClaims: parseInt(cr?.denied_claims ?? 0),
    denialRate: parseFloat(cr?.denial_rate ?? 0),
    totalBilledAtRisk: parseFloat(cr?.total_billed_at_risk ?? 0),
    appealedClaims: appealed,
    wonAppeals: won,
    appealSuccessRate: appealed > 0 ? Math.round((won / appealed) * 1000) / 10 : 0,
  };
}

export async function getTopDenialCodes(filters: {
  locationId?: string;
  limit?: number;
}): Promise<DenialCodeStat[]> {
  const locationFilter = filters.locationId
    ? `AND c.location_id = '${filters.locationId}'`
    : "";
  const limit = filters.limit ?? 20;

  const result = await db.execute(sql.raw(`
    SELECT
      TRIM(unnest(string_to_array(c.denial_codes, ','))) AS code,
      COUNT(*)::int AS occurrences,
      SUM(COALESCE(c.billed_amount, 0))::float AS total_billed_at_risk,
      ARRAY_AGG(DISTINCT COALESCE(c.payer, 'Unknown')) AS payers
    FROM claims c
    WHERE c.status = 'DENIED'
      AND c.denial_codes IS NOT NULL
      ${locationFilter}
    GROUP BY TRIM(unnest(string_to_array(c.denial_codes, ',')))
    ORDER BY occurrences DESC
    LIMIT ${limit}
  `));

  return result.rows.map((r: any) => ({
    code: r.code,
    occurrences: parseInt(r.occurrences),
    totalBilledAtRisk: parseFloat(r.total_billed_at_risk),
    payers: Array.isArray(r.payers) ? r.payers : [],
  }));
}

export async function getProviderDenialOutliers(filters: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<ProviderDenialOutlier[]> {
  const conditions: string[] = ["c.provider_id IS NOT NULL"];
  if (filters.dateFrom) conditions.push(`c.dos >= '${filters.dateFrom}'`);
  if (filters.dateTo) conditions.push(`c.dos <= '${filters.dateTo}'`);
  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const result = await db.execute(sql.raw(`
    WITH provider_stats AS (
      SELECT
        c.provider_id,
        COUNT(*)::int AS total_claims,
        COUNT(CASE WHEN c.status = 'DENIED' THEN 1 END)::int AS denied_claims,
        ROUND(
          COUNT(CASE WHEN c.status = 'DENIED' THEN 1 END)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1
        ) AS denial_rate
      FROM claims c
      ${whereClause}
      GROUP BY c.provider_id
      HAVING COUNT(*) >= 10
    ),
    avg_rate AS (
      SELECT AVG(denial_rate) AS avg FROM provider_stats
    )
    SELECT
      ps.provider_id,
      COALESCE(u.name, ps.provider_id::text) AS provider_name,
      ps.total_claims,
      ps.denied_claims,
      ps.denial_rate::float,
      ar.avg::float AS avg_denial_rate
    FROM provider_stats ps
    LEFT JOIN users u ON u.id::text = ps.provider_id::text,
    avg_rate ar
    WHERE ps.denial_rate > ar.avg * 2
    ORDER BY ps.denial_rate DESC
  `));

  return result.rows.map((r: any) => ({
    providerId: r.provider_id,
    providerName: r.provider_name,
    totalClaims: parseInt(r.total_claims),
    deniedClaims: parseInt(r.denied_claims),
    denialRate: parseFloat(r.denial_rate),
    avgDenialRate: parseFloat(r.avg_denial_rate) || 0,
  }));
}

export async function getDenialTrends(filters: {
  locationId?: string;
  months?: number;
}): Promise<DenialTrend[]> {
  const locationFilter = filters.locationId
    ? `AND c.location_id = '${filters.locationId}'`
    : "";
  const months = filters.months ?? 12;

  const result = await db.execute(sql.raw(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', c.dos::date), 'YYYY-MM') AS month,
      COUNT(*)::int AS total_claims,
      COUNT(CASE WHEN c.status = 'DENIED' THEN 1 END)::int AS denied_claims,
      ROUND(
        COUNT(CASE WHEN c.status = 'DENIED' THEN 1 END)::numeric
        / NULLIF(COUNT(*), 0) * 100, 1
      )::float AS denial_rate,
      SUM(CASE WHEN c.status = 'DENIED' THEN COALESCE(c.billed_amount, 0) ELSE 0 END)::float AS total_billed_at_risk
    FROM claims c
    WHERE c.dos >= (CURRENT_DATE - INTERVAL '${months} months')
      ${locationFilter}
    GROUP BY DATE_TRUNC('month', c.dos::date)
    ORDER BY month ASC
  `));

  return result.rows.map((r: any) => ({
    month: r.month,
    totalClaims: parseInt(r.total_claims),
    deniedClaims: parseInt(r.denied_claims),
    denialRate: parseFloat(r.denial_rate),
    totalBilledAtRisk: parseFloat(r.total_billed_at_risk),
  }));
}
