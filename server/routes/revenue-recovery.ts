/**
 * Revenue Leakage Recovery Engine API routes.
 * Phases 2, 3 & 6: reimbursement analysis + denial intelligence + data import.
 * Read access: OWNER, DIRECTOR, ANALYST. Write access: OWNER, DIRECTOR.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { insertClaimSchema, insertPayerRateSchema } from "@shared/schema";
import { requireRole, qstr, getUserLocationScope } from "./shared";
import { getPayerProfitability } from "../storage-revenue-recovery";
import { getBcbsAuditStatus } from "../storage-bcbs-audit";
import { registerRevenueRecoveryImportRoutes } from "./revenue-recovery-import";

export async function registerRevenueRecoveryRoutes(app: Express) {
  // CSV/XLSX template + import endpoints live in a dedicated module.
  await registerRevenueRecoveryImportRoutes(app);

  const READ = requireRole("OWNER", "DIRECTOR", "ANALYST");
  const WRITE = requireRole("OWNER", "DIRECTOR");

  // ---- Claims ----

  // GET /api/revenue/claims — paginated claims list
  app.get("/api/revenue/claims", READ, async (req, res) => {
    try {
      const page = parseInt(qstr(req.query.page as any) || "1");
      const pageSize = Math.min(parseInt(qstr(req.query.pageSize as any) || "50"), 200);
      const result = await storage.getClaims({
        locationId: qstr(req.query.locationId as any),
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        payer: qstr(req.query.payer as any),
        status: qstr(req.query.status as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
        isUnderpaid: req.query.isUnderpaid === "true" ? true : req.query.isUnderpaid === "false" ? false : undefined,
        page,
        pageSize,
      });
      res.json({ ...result, page, pageSize });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/revenue/claims/:id — single claim detail
  app.get("/api/revenue/claims/:id", READ, async (req, res) => {
    try {
      const claim = await storage.getClaim(req.params.id as string);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      // Location scope: a scoped reader may only see claims at their locations.
      const scope = await getUserLocationScope(req);
      if (scope !== null && (!claim.locationId || !scope.includes(claim.locationId))) {
        return res.status(404).json({ message: "Claim not found" });
      }
      res.json(claim);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/revenue/claims — create/upsert claim
  app.post("/api/revenue/claims", WRITE, async (req, res) => {
    try {
      const parsed = insertClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }
      const claim = await storage.upsertClaim(parsed.data);
      res.status(201).json(claim);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/revenue/claims/bulk — bulk upsert claims
  app.post("/api/revenue/claims/bulk", WRITE, async (req, res) => {
    try {
      const arraySchema = z.array(insertClaimSchema).min(1, "At least one claim required").max(500, "Max 500 claims per batch");
      const parsed = arraySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }
      const result = await storage.bulkUpsertClaims(parsed.data);
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- Reimbursement Analysis ----

  // GET /api/revenue/underpaid — underpaid claims list with variance
  app.get("/api/revenue/underpaid", READ, async (req, res) => {
    try {
      const minVariance = req.query.minVariance ? parseFloat(qstr(req.query.minVariance as any) || "0") : undefined;
      const result = await storage.getUnderpaidClaims({
        locationId: qstr(req.query.locationId as any),
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        payer: qstr(req.query.payer as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
        minVariance,
        page: req.query.page ? parseInt(qstr(req.query.page as any) || "1") : undefined,
        pageSize: req.query.pageSize ? parseInt(qstr(req.query.pageSize as any) || "200") : undefined,
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/revenue/summary — reimbursement summary by payer
  app.get("/api/revenue/summary", READ, async (req, res) => {
    try {
      const result = await storage.getReimbursementSummary({
        locationId: qstr(req.query.locationId as any),
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/revenue/payer-profitability — per-payer profitability matrix
  app.get("/api/revenue/payer-profitability", READ, async (req, res) => {
    try {
      const locationScope = await getUserLocationScope(req);
      if (locationScope !== null && locationScope.length === 0) {
        return res.json([]);
      }
      const requestedLocation = qstr(req.query.locationId as any);
      if (requestedLocation && locationScope !== null && !locationScope.includes(requestedLocation)) {
        return res.json([]);
      }
      const result = await getPayerProfitability({
        locationId: requestedLocation,
        locationIds: locationScope,
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/revenue/flag-underpaid — run underpayment flagging job
  app.post("/api/revenue/flag-underpaid", WRITE, async (req, res) => {
    try {
      const count = await storage.flagUnderpaidClaims(req.body?.locationId ? { locationId: req.body.locationId } : undefined);
      res.json({ flagged: count });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- Payer Rate Schedule ----

  // GET /api/revenue/rates — payer rate schedule
  app.get("/api/revenue/rates", READ, async (req, res) => {
    try {
      const result = await storage.getPayerRates(
        qstr(req.query.payer as any),
        qstr(req.query.cptCode as any),
      );
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/revenue/rates — upsert a single rate
  app.post("/api/revenue/rates", WRITE, async (req, res) => {
    try {
      const parsed = insertPayerRateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }
      const rate = await storage.upsertPayerRate(parsed.data);
      res.status(201).json(rate);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/revenue/rates/build — build rates from historical claims
  app.post("/api/revenue/rates/build", WRITE, async (req, res) => {
    try {
      const count = await storage.buildRatesFromHistory(req.body?.payer);
      res.json({ ratesBuilt: count });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- Denial Intelligence ----

  app.get("/api/revenue/underpayments/by-payer", READ, async (req, res) => {
    try {
      const scope = await getUserLocationScope(req);
      const scopeSql = scope !== null ? sql` AND location_id = ANY(${scope})` : sql``;
      const result = await db.execute(sql`
        SELECT
          payer,
          payer_type,
          COUNT(*) as claim_count,
          SUM(billed_amount::numeric) as total_billed,
          SUM(paid_amount::numeric) as total_paid,
          SUM(expected_amount::numeric) as total_expected,
          SUM(underpaid_amount::numeric) as total_underpaid,
          ROUND(AVG(underpaid_amount::numeric), 2) as avg_underpaid,
          ROUND(SUM(underpaid_amount::numeric) / NULLIF(SUM(expected_amount::numeric), 0) * 100, 1) as underpaid_pct
        FROM claims
        WHERE is_underpaid = true
          AND underpaid_amount IS NOT NULL
          AND underpaid_amount > 0
          ${scopeSql}
        GROUP BY payer, payer_type
        ORDER BY total_underpaid DESC
      `);
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/revenue/underpayments/by-cpt", READ, async (req, res) => {
    try {
      const scope = await getUserLocationScope(req);
      const scopeSql = scope !== null ? sql` AND location_id = ANY(${scope})` : sql``;
      const result = await db.execute(sql`
        SELECT
          cpt_codes as cpt_code,
          COUNT(*) as claim_count,
          SUM(billed_amount::numeric) as total_billed,
          SUM(paid_amount::numeric) as total_paid,
          SUM(expected_amount::numeric) as total_expected,
          SUM(underpaid_amount::numeric) as total_underpaid
        FROM claims
        WHERE is_underpaid = true
          AND underpaid_amount IS NOT NULL
          AND underpaid_amount > 0
          AND cpt_codes IS NOT NULL
          ${scopeSql}
        GROUP BY cpt_codes
        ORDER BY total_underpaid DESC
        LIMIT 50
      `);
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/revenue/underpayments/resolve", WRITE, async (req, res) => {
    try {
      const schema = z.object({
        claimIds: z.array(z.string().uuid()).min(1, "At least one claim ID required"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }

      const { claimIds } = parsed.data;
      await db.execute(sql`
        UPDATE claims
        SET is_underpaid = false, updated_at = NOW()
        WHERE id = ANY(${claimIds}::uuid[])
      `);

      res.json({ resolved: claimIds.length });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- BCBS Audit Status Panel ----

  // GET /api/revenue/bcbs-audit — payer-scoped audit status (defaults to BCBS)
  app.get("/api/revenue/bcbs-audit", READ, async (req, res) => {
    try {
      const result = await getBcbsAuditStatus({
        payer: qstr(req.query.payer as any),
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- Denial Intelligence (summary) ----

  // GET /api/revenue/denials/summary — overall denial stats
  app.get("/api/revenue/denials/summary", READ, async (req, res) => {
    try {
      const result = await storage.getDenialSummary({
        locationId: qstr(req.query.locationId as any),
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/revenue/denials/top-codes — top denial codes with counts
  app.get("/api/revenue/denials/top-codes", READ, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(qstr(req.query.limit as any) || "20") : undefined;
      const result = await storage.getTopDenialCodes({
        locationId: qstr(req.query.locationId as any),
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        limit,
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/revenue/denials/outliers — providers with >2x avg denial rate
  app.get("/api/revenue/denials/outliers", READ, async (req, res) => {
    try {
      const result = await storage.getProviderDenialOutliers({
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/revenue/denials/trends — monthly denial rate trend
  app.get("/api/revenue/denials/trends", READ, async (req, res) => {
    try {
      const months = req.query.months ? parseInt(qstr(req.query.months as any) || "12") : undefined;
      const result = await storage.getDenialTrends({
        locationId: qstr(req.query.locationId as any),
        locationIds: (await getUserLocationScope(req)) ?? undefined,
        months,
      });
      res.json(result);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
