/**
 * Revenue Leakage Recovery — CRUD + reimbursement analysis queries.
 * Extracted to keep files under 200 lines. Denial intelligence is in storage-denial-intelligence.ts.
 */
import { db } from "./db";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import {
  claims, claimPayments, payerRateSchedule,
  type Claim, type InsertClaim,
  type ClaimPayment, type InsertClaimPayment,
  type PayerRate, type InsertPayerRate,
} from "@shared/schema";

// ---- Exported aggregate types ----

export interface UnderpaidClaim {
  id: string;
  claimNumber: string;
  payer: string | null;
  dos: string;
  billedAmount: number;
  paidAmount: number;
  expectedAmount: number;
  underpaidAmount: number;
  variancePct: number;
  status: string | null;
  cptCodes: string | null;
}

export interface ReimbursementSummary {
  payer: string;
  claimCount: number;
  totalBilled: number;
  totalPaid: number;
  totalExpected: number;
  totalUnderpaid: number;
  underpaidCount: number;
  avgRealizationPct: number;
}

// ---- Claims CRUD ----

export async function getClaims(filters: {
  locationId?: string;
  payer?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  isUnderpaid?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ data: Claim[]; total: number }> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const offset = (page - 1) * pageSize;
  const conditions: any[] = [];

  if (filters.locationId) conditions.push(eq(claims.locationId, filters.locationId));
  if (filters.payer) conditions.push(eq(claims.payer, filters.payer));
  if (filters.status) conditions.push(eq(claims.status, filters.status as any));
  if (filters.dateFrom) conditions.push(gte(claims.dos, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(claims.dos, filters.dateTo));
  if (filters.isUnderpaid !== undefined) conditions.push(eq(claims.isUnderpaid, filters.isUnderpaid));

  const where = conditions.length ? and(...conditions) : undefined;
  const [data, countResult] = await Promise.all([
    db.select().from(claims).where(where).orderBy(desc(claims.dos)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`COUNT(*)` }).from(claims).where(where),
  ]);

  return { data, total: Number(countResult[0]?.count ?? 0) };
}

export async function getClaim(id: string): Promise<Claim | undefined> {
  const [row] = await db.select().from(claims).where(eq(claims.id, id));
  return row;
}

export async function upsertClaim(data: InsertClaim): Promise<Claim> {
  const [row] = await db.insert(claims)
    .values(data)
    .onConflictDoUpdate({
      target: [claims.claimNumber],
      set: {
        locationId: data.locationId,
        providerId: data.providerId,
        physicianId: data.physicianId,
        dos: data.dos,
        cptCodes: data.cptCodes,
        units: data.units,
        payer: data.payer,
        payerType: data.payerType,
        billedAmount: data.billedAmount,
        expectedAmount: data.expectedAmount,
        paidAmount: data.paidAmount,
        adjustmentAmount: data.adjustmentAmount,
        patientResponsibility: data.patientResponsibility,
        status: data.status,
        submissionDate: data.submissionDate,
        paymentDate: data.paymentDate,
        denialCodes: data.denialCodes,
        denialReason: data.denialReason,
        isUnderpaid: data.isUnderpaid,
        underpaidAmount: data.underpaidAmount,
        source: data.source,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function bulkUpsertClaims(rows: InsertClaim[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await db.select({ id: claims.id }).from(claims)
      .where(eq(claims.claimNumber, row.claimNumber)).limit(1);
    await upsertClaim(row);
    if (existing.length > 0) updated++; else inserted++;
  }
  return { inserted, updated };
}

// ---- Reimbursement Analysis ----

export async function getUnderpaidClaims(filters: {
  locationId?: string;
  payer?: string;
  dateFrom?: string;
  dateTo?: string;
  minVariance?: number;
}): Promise<UnderpaidClaim[]> {
  const conditions = [`c.is_underpaid = true`];
  if (filters.locationId) conditions.push(`c.location_id = '${filters.locationId}'`);
  if (filters.payer) conditions.push(`c.payer = '${filters.payer.replace(/'/g, "''")}'`);
  if (filters.dateFrom) conditions.push(`c.dos >= '${filters.dateFrom}'`);
  if (filters.dateTo) conditions.push(`c.dos <= '${filters.dateTo}'`);
  const minVar = filters.minVariance ?? 0;

  const result = await db.execute(sql.raw(`
    SELECT
      c.id, c.claim_number, c.payer, c.dos::text, c.status,
      c.cpt_codes,
      COALESCE(c.billed_amount, 0)::float AS billed_amount,
      COALESCE(c.paid_amount, 0)::float AS paid_amount,
      COALESCE(c.expected_amount, 0)::float AS expected_amount,
      COALESCE(c.underpaid_amount, 0)::float AS underpaid_amount,
      CASE WHEN COALESCE(c.expected_amount, 0) > 0
        THEN ROUND((COALESCE(c.underpaid_amount, 0) / c.expected_amount) * 100, 1)
        ELSE 0 END::float AS variance_pct
    FROM claims c
    WHERE ${conditions.join(" AND ")}
      AND COALESCE(c.underpaid_amount, 0) >= ${minVar}
    ORDER BY c.underpaid_amount DESC
  `));

  return result.rows.map((r: any) => ({
    id: r.id,
    claimNumber: r.claim_number,
    payer: r.payer,
    dos: r.dos,
    billedAmount: parseFloat(r.billed_amount),
    paidAmount: parseFloat(r.paid_amount),
    expectedAmount: parseFloat(r.expected_amount),
    underpaidAmount: parseFloat(r.underpaid_amount),
    variancePct: parseFloat(r.variance_pct),
    status: r.status,
    cptCodes: r.cpt_codes,
  }));
}

export async function getReimbursementSummary(filters: {
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ReimbursementSummary[]> {
  const conditions = [`c.status IN ('PAID', 'PARTIAL')`];
  if (filters.locationId) conditions.push(`c.location_id = '${filters.locationId}'`);
  if (filters.dateFrom) conditions.push(`c.dos >= '${filters.dateFrom}'`);
  if (filters.dateTo) conditions.push(`c.dos <= '${filters.dateTo}'`);

  const result = await db.execute(sql.raw(`
    SELECT
      COALESCE(c.payer, 'Unknown') AS payer,
      COUNT(*)::int AS claim_count,
      SUM(COALESCE(c.billed_amount, 0))::float AS total_billed,
      SUM(COALESCE(c.paid_amount, 0))::float AS total_paid,
      SUM(COALESCE(c.expected_amount, 0))::float AS total_expected,
      SUM(CASE WHEN c.is_underpaid THEN COALESCE(c.underpaid_amount, 0) ELSE 0 END)::float AS total_underpaid,
      COUNT(CASE WHEN c.is_underpaid THEN 1 END)::int AS underpaid_count,
      ROUND(AVG(
        CASE WHEN COALESCE(c.billed_amount, 0) > 0
          THEN c.paid_amount / c.billed_amount * 100
          ELSE NULL END
      ), 1)::float AS avg_realization_pct
    FROM claims c
    WHERE ${conditions.join(" AND ")}
    GROUP BY COALESCE(c.payer, 'Unknown')
    ORDER BY total_underpaid DESC
  `));

  return result.rows.map((r: any) => ({
    payer: r.payer,
    claimCount: parseInt(r.claim_count),
    totalBilled: parseFloat(r.total_billed),
    totalPaid: parseFloat(r.total_paid),
    totalExpected: parseFloat(r.total_expected),
    totalUnderpaid: parseFloat(r.total_underpaid),
    underpaidCount: parseInt(r.underpaid_count),
    avgRealizationPct: parseFloat(r.avg_realization_pct) || 0,
  }));
}

// ---- Payer Rate Schedule ----

export async function getPayerRates(payer?: string, cptCode?: string): Promise<PayerRate[]> {
  const conditions: any[] = [];
  if (payer) conditions.push(eq(payerRateSchedule.payer, payer));
  if (cptCode) conditions.push(eq(payerRateSchedule.cptCode, cptCode));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(payerRateSchedule).where(where).orderBy(payerRateSchedule.payer, payerRateSchedule.cptCode);
}

export async function upsertPayerRate(data: InsertPayerRate): Promise<PayerRate> {
  const [row] = await db.insert(payerRateSchedule)
    .values(data)
    .onConflictDoUpdate({
      target: [payerRateSchedule.payer, payerRateSchedule.cptCode],
      set: {
        payerType: data.payerType,
        expectedRate: data.expectedRate,
        effectiveDate: data.effectiveDate,
        locationId: data.locationId,
        source: data.source,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function bulkUpsertPayerRates(rows: InsertPayerRate[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await db.select({ id: payerRateSchedule.id }).from(payerRateSchedule)
      .where(and(eq(payerRateSchedule.payer, row.payer), eq(payerRateSchedule.cptCode, row.cptCode))).limit(1);
    await upsertPayerRate(row);
    if (existing.length > 0) updated++; else inserted++;
  }
  return { inserted, updated };
}

export async function buildRatesFromHistory(payer?: string): Promise<number> {
  // Calculate average paid-per-unit rates from historical paid claims and store in rate schedule
  const payerFilter = payer ? `AND c.payer = '${payer.replace(/'/g, "''")}'` : "";
  const result = await db.execute(sql.raw(`
    SELECT
      c.payer,
      c.payer_type,
      unnest(string_to_array(c.cpt_codes, ',')) AS cpt_code,
      AVG(CASE WHEN COALESCE(c.units, 0) > 0 THEN c.paid_amount / c.units ELSE c.paid_amount END) AS avg_rate
    FROM claims c
    WHERE c.status IN ('PAID', 'PARTIAL')
      AND c.paid_amount > 0
      AND c.cpt_codes IS NOT NULL
      ${payerFilter}
    GROUP BY c.payer, c.payer_type, unnest(string_to_array(c.cpt_codes, ','))
    HAVING AVG(CASE WHEN COALESCE(c.units, 0) > 0 THEN c.paid_amount / c.units ELSE c.paid_amount END) > 0
  `));

  let count = 0;
  for (const r of result.rows as any[]) {
    if (!r.payer || !r.cpt_code) continue;
    await upsertPayerRate({
      payer: r.payer,
      payerType: r.payer_type,
      cptCode: r.cpt_code.trim(),
      expectedRate: String(parseFloat(r.avg_rate).toFixed(2)),
      source: "calculated",
    });
    count++;
  }
  return count;
}

// ---- Underpayment flagging ----

export async function calculateExpectedAmount(claimId: string): Promise<number> {
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim || !claim.cptCodes || !claim.payer) return 0;

  const codes = claim.cptCodes.split(",").map(c => c.trim()).filter(Boolean);
  if (!codes.length) return 0;

  let total = 0;
  for (const code of codes) {
    const [rate] = await db.select().from(payerRateSchedule)
      .where(and(eq(payerRateSchedule.payer, claim.payer), eq(payerRateSchedule.cptCode, code)))
      .orderBy(desc(payerRateSchedule.updatedAt))
      .limit(1);
    if (rate) {
      const units = claim.units || 1;
      total += parseFloat(String(rate.expectedRate)) * units;
    }
  }
  return Math.round(total * 100) / 100;
}

export async function flagUnderpaidClaims(filters?: { locationId?: string }): Promise<number> {
  // Get all paid/partial claims without expected amount, or where expected > paid
  const locationFilter = filters?.locationId ? `AND c.location_id = '${filters.locationId}'` : "";
  const result = await db.execute(sql.raw(`
    SELECT c.id FROM claims c
    WHERE c.status IN ('PAID', 'PARTIAL')
      AND c.cpt_codes IS NOT NULL
      AND c.payer IS NOT NULL
      ${locationFilter}
  `));

  let flagged = 0;
  for (const r of result.rows as any[]) {
    const expected = await calculateExpectedAmount(r.id);
    if (expected <= 0) continue;

    const [claim] = await db.select().from(claims).where(eq(claims.id, r.id));
    const paid = parseFloat(String(claim?.paidAmount ?? 0));
    const isUnderpaid = paid < expected * 0.95; // 5% tolerance
    const underpaidAmt = isUnderpaid ? Math.round((expected - paid) * 100) / 100 : 0;

    await db.update(claims).set({
      expectedAmount: String(expected),
      isUnderpaid,
      underpaidAmount: isUnderpaid ? String(underpaidAmt) : null,
      updatedAt: new Date(),
    }).where(eq(claims.id, r.id));

    if (isUnderpaid) flagged++;
  }
  return flagged;
}
