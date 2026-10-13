/**
 * BCBS Audit Status Panel — payer-scoped claim-lifecycle + exposure queries.
 * Reuses the revenue-recovery `claims` + `appeals` tables; no new tables.
 * Defaults to Blue Cross Blue Shield payer matching; accepts a payer override.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

export interface BcbsStatusBucket {
  status: string;
  claimCount: number;
  billed: number;
  paid: number;
  underpaid: number;
}

export interface BcbsFlaggedClaim {
  id: string;
  claimNumber: string;
  dos: string;
  cptCodes: string | null;
  status: string | null;
  billed: number;
  paid: number;
  underpaidAmount: number;
  denialCodes: string | null;
}

export interface BcbsAuditStatus {
  payerLabel: string;
  kpis: {
    totalClaims: number;
    totalBilled: number;
    totalPaid: number;
    atRisk: number;
    openAppeals: number;
    appealWinPct: number;
  };
  byStatus: BcbsStatusBucket[];
  flaggedClaims: BcbsFlaggedClaim[];
}

// Build the payer-match SQL fragment: explicit payer, else default BCBS matching.
function payerCondition(payer?: string) {
  return payer
    ? sql`c.payer = ${payer}`
    : sql`(c.payer ILIKE '%blue%' OR c.payer ILIKE '%bcbs%')`;
}

export async function getBcbsAuditStatus(filters: {
  payer?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BcbsAuditStatus> {
  const conditions: ReturnType<typeof sql>[] = [payerCondition(filters.payer)];
  if (filters.dateFrom) conditions.push(sql`c.dos >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(sql`c.dos <= ${filters.dateTo}`);
  const where = sql.join(conditions, sql` AND `);

  // Status breakdown + rolled-up KPI figures in one pass.
  const statusResult = await db.execute(sql`
    SELECT
      COALESCE(c.status::text, 'UNKNOWN') AS status,
      COUNT(*)::int AS claim_count,
      SUM(COALESCE(c.billed_amount, 0))::float AS billed,
      SUM(COALESCE(c.paid_amount, 0))::float AS paid,
      SUM(CASE WHEN c.is_underpaid THEN COALESCE(c.underpaid_amount, 0) ELSE 0 END)::float AS underpaid
    FROM claims c
    WHERE ${where}
    GROUP BY COALESCE(c.status::text, 'UNKNOWN')
    ORDER BY claim_count DESC
  `);

  const byStatus: BcbsStatusBucket[] = statusResult.rows.map((r: any) => ({
    status: r.status,
    claimCount: Number(r.claim_count),
    billed: Number(r.billed),
    paid: Number(r.paid),
    underpaid: Number(r.underpaid),
  }));

  const totalClaims = byStatus.reduce((s, b) => s + b.claimCount, 0);
  const totalBilled = byStatus.reduce((s, b) => s + b.billed, 0);
  const totalPaid = byStatus.reduce((s, b) => s + b.paid, 0);
  // $ at risk = underpaid exposure + outstanding balance on denied claims.
  const atRisk =
    byStatus.reduce((s, b) => s + b.underpaid, 0) +
    byStatus
      .filter((b) => b.status === "DENIED")
      .reduce((s, b) => s + Math.max(b.billed - b.paid, 0), 0);

  // Appeals on matching claims: open count + win rate.
  const appealResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE a.status IN ('DRAFTED', 'SUBMITTED'))::int AS open_appeals,
      COUNT(*) FILTER (WHERE a.status = 'WON')::int AS won,
      COUNT(*) FILTER (WHERE a.status IN ('WON', 'LOST'))::int AS decided
    FROM appeals a
    JOIN claims c ON c.id = a.claim_id
    WHERE ${where}
  `);
  const ar: any = appealResult.rows[0] || {};
  const decided = Number(ar.decided || 0);
  const appealWinPct = decided > 0 ? Math.round((Number(ar.won || 0) / decided) * 1000) / 10 : 0;

  // Flagged claims needing attention: denied or underpaid.
  const flaggedResult = await db.execute(sql`
    SELECT
      c.id, c.claim_number, c.dos::text AS dos, c.cpt_codes, c.status::text AS status,
      COALESCE(c.billed_amount, 0)::float AS billed,
      COALESCE(c.paid_amount, 0)::float AS paid,
      COALESCE(c.underpaid_amount, 0)::float AS underpaid_amount,
      c.denial_codes
    FROM claims c
    WHERE ${where}
      AND (c.status = 'DENIED' OR c.is_underpaid = true)
    ORDER BY COALESCE(c.underpaid_amount, 0) DESC, c.dos DESC
    LIMIT 50
  `);

  const flaggedClaims: BcbsFlaggedClaim[] = flaggedResult.rows.map((r: any) => ({
    id: r.id,
    claimNumber: r.claim_number,
    dos: r.dos,
    cptCodes: r.cpt_codes,
    status: r.status,
    billed: Number(r.billed),
    paid: Number(r.paid),
    underpaidAmount: Number(r.underpaid_amount),
    denialCodes: r.denial_codes,
  }));

  return {
    payerLabel: filters.payer || "Blue Cross Blue Shield",
    kpis: {
      totalClaims,
      totalBilled,
      totalPaid,
      atRisk,
      openAppeals: Number(ar.open_appeals || 0),
      appealWinPct,
    },
    byStatus,
    flaggedClaims,
  };
}
