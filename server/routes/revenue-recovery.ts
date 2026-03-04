/**
 * Revenue Leakage Recovery Engine API routes.
 * Phases 2, 3 & 6: reimbursement analysis + denial intelligence + data import.
 * Read access: OWNER, DIRECTOR, ANALYST. Write access: OWNER, DIRECTOR.
 */
import type { Express } from "express";
import os from "os";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, qstr } from "./shared";
import { flagUnderpaidClaims, upsertClaim, upsertPayerRate } from "../storage-revenue-recovery";
import { evaluateBillingLagAlerts } from "../billing-lag-alert-engine";

export async function registerRevenueRecoveryRoutes(app: Express) {
  const multer = (await import("multer")).default;
  const ExcelJS = (await import("exceljs")).default;

  const uploadDir = path.join(os.tmpdir(), "crm-uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });

  const READ = requireRole("OWNER", "DIRECTOR", "ANALYST");
  const WRITE = requireRole("OWNER", "DIRECTOR");

  // Read uploaded file into ExcelJS workbook, then clean up temp file
  async function loadWorkbook(file: Express.Multer.File) {
    const workbook = new ExcelJS.Workbook();
    try {
      if (file.originalname.endsWith(".csv")) await workbook.csv.readFile(file.path);
      else await workbook.xlsx.readFile(file.path);
    } finally {
      fs.unlink(file.path, () => {});
    }
    return workbook;
  }

  // Parse numeric value from cell
  function parseNum(val: any): number {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val.replace(/[$,\s]/g, "")) || 0;
    return 0;
  }

  // Parse date from Excel serial, Date object, or string
  function parseDateVal(val: any): string | null {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    if (typeof val === "number") {
      const utcDays = Math.floor(val - 25569);
      return new Date(utcDays * 86400000).toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
      const [m, d, y] = s.split("/");
      const yr = y.length === 2 ? "20" + y : y;
      return `${yr}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }

  // Auto-detect column mapping based on import type and column headers
  function autoDetectClaimsMapping(importType: string, headers: string[]): Record<string, string | null> {
    const lower = headers.map(h => (h || "").toLowerCase());
    function find(keywords: string[]): string | null {
      for (const kw of keywords) {
        const idx = lower.findIndex(h => h.includes(kw));
        if (idx !== -1) return headers[idx];
      }
      return null;
    }
    if (importType === "claims") {
      return {
        claimNumber: find(["claim number", "claim #", "claim_number", "claimnum"]),
        patientName: find(["patient", "member"]),
        dos: find(["dos", "date of service", "service date"]),
        cptCodes: find(["cpt", "procedure", "service code"]),
        units: find(["units", "quantity"]),
        payer: find(["payer", "insurance", "carrier"]),
        billedAmount: find(["billed", "charge", "total charge"]),
        paidAmount: find(["paid", "payment", "allowed"]),
        status: find(["status", "claim status"]),
        denialCodes: find(["denial", "remark", "carc", "rarc"]),
      };
    }
    if (importType === "payments") {
      return {
        claimNumber: find(["claim number", "claim #", "claim_number"]),
        paymentDate: find(["payment date", "paid date", "check date"]),
        paidAmount: find(["paid amount", "payment amount", "payment"]),
        adjustmentAmount: find(["adjustment", "adj", "writeoff"]),
        checkNumber: find(["check number", "check #", "eft"]),
      };
    }
    if (importType === "rates") {
      return {
        payer: find(["payer", "insurance", "carrier"]),
        cptCode: find(["cpt", "cpt code", "procedure code"]),
        expectedRate: find(["expected rate", "rate", "fee", "allowed amount"]),
        effectiveDate: find(["effective date", "effective", "start date"]),
      };
    }
    return {};
  }

  // ---- Claims ----

  // GET /api/revenue/claims — paginated claims list
  app.get("/api/revenue/claims", READ, async (req, res) => {
    try {
      const page = parseInt(qstr(req.query.page as any) || "1");
      const pageSize = Math.min(parseInt(qstr(req.query.pageSize as any) || "50"), 200);
      const result = await storage.getClaims({
        locationId: qstr(req.query.locationId as any),
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
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/revenue/claims/:id — single claim detail
  app.get("/api/revenue/claims/:id", READ, async (req, res) => {
    try {
      const claim = await storage.getClaim(req.params.id as string);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      res.json(claim);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/revenue/claims — create/upsert claim
  app.post("/api/revenue/claims", WRITE, async (req, res) => {
    try {
      const claim = await storage.upsertClaim(req.body);
      res.status(201).json(claim);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/revenue/claims/bulk — bulk upsert claims
  app.post("/api/revenue/claims/bulk", WRITE, async (req, res) => {
    try {
      if (!Array.isArray(req.body)) return res.status(400).json({ message: "Expected array" });
      const result = await storage.bulkUpsertClaims(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/revenue/claims/import-preview — preview claims/payments/rates CSV file
  app.post(
    "/api/revenue/claims/import-preview",
    WRITE,
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const importType = req.body.importType || "claims";
        const workbook = await loadWorkbook(req.file);
        const worksheet = workbook.worksheets[0];

        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell: any, colNumber: number) => {
          headers[colNumber] = String(cell.value || "").trim();
        });

        const sampleRows: Record<string, any>[] = [];
        worksheet.eachRow((row: any, rowNumber: number) => {
          if (rowNumber === 1 || rowNumber > 6) return;
          const obj: Record<string, any> = {};
          row.eachCell((cell: any, colNumber: number) => {
            if (headers[colNumber]) obj[headers[colNumber]] = cell.value;
          });
          sampleRows.push(obj);
        });

        let totalRows = 0;
        worksheet.eachRow(() => totalRows++);

        res.json({
          headers: headers.filter(Boolean),
          sampleRows,
          totalRows: totalRows - 1,
          importType,
          suggestedMapping: autoDetectClaimsMapping(importType, headers.filter(Boolean)),
        });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // POST /api/revenue/claims/import — commit claims/payments/rates import to DB
  app.post(
    "/api/revenue/claims/import",
    WRITE,
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const importType = req.body.importType || "claims";
        const columnMapping = JSON.parse(req.body.columnMapping || "{}");

        const workbook = await loadWorkbook(req.file);
        const worksheet = workbook.worksheets[0];
        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell: any, colNumber: number) => {
          headers[colNumber] = String(cell.value || "").trim();
        });

        const rows: Record<string, any>[] = [];
        worksheet.eachRow((row: any, rowNumber: number) => {
          if (rowNumber === 1) return;
          const obj: Record<string, any> = {};
          row.eachCell((cell: any, colNumber: number) => {
            if (headers[colNumber]) obj[headers[colNumber]] = cell.value;
          });
          rows.push(obj);
        });

        let imported = 0;
        let updated = 0;
        const errors: string[] = [];

        if (importType === "claims") {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const claimNumber = String(row[columnMapping.claimNumber] || "").trim();
            if (!claimNumber) {
              errors.push(`Row ${i + 2}: Missing claim number`);
              continue;
            }
            const dos = parseDateVal(row[columnMapping.dos]);
            if (!dos) {
              errors.push(`Row ${i + 2}: Invalid date of service`);
              continue;
            }
            const billedAmount = parseNum(row[columnMapping.billedAmount]);
            const paidAmount = parseNum(row[columnMapping.paidAmount]);
            // upsertClaim handles conflict on claimNumber via ON CONFLICT DO UPDATE
            await upsertClaim({
              claimNumber,
              dos,
              payer: String(row[columnMapping.payer] || "").trim() || null,
              cptCodes: String(row[columnMapping.cptCodes] || "").trim() || null,
              units: columnMapping.units ? parseNum(row[columnMapping.units]) : null,
              billedAmount: String(billedAmount),
              paidAmount: String(paidAmount),
              status: String(row[columnMapping.status] || "PENDING").trim().toUpperCase() as any,
              denialCodes: String(row[columnMapping.denialCodes] || "").trim() || null,
              source: "import",
            });
            imported++;
          }
          // Run flagging after claims import
          const flagged = await flagUnderpaidClaims();
          const alertsTriggered = await evaluateBillingLagAlerts();
          res.json({ imported, updated, errors: errors.slice(0, 20), alertsTriggered, flagged });
        } else if (importType === "payments") {
          // Map payments to claim_payments table by matching claimNumber
          const { db } = await import("../db");
          const { claimPayments, claims } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const claimNumber = String(row[columnMapping.claimNumber] || "").trim();
            if (!claimNumber) {
              errors.push(`Row ${i + 2}: Missing claim number`);
              continue;
            }
            const [claim] = await db.select({ id: claims.id }).from(claims)
              .where(eq(claims.claimNumber, claimNumber)).limit(1);
            if (!claim) {
              errors.push(`Row ${i + 2}: Claim not found for "${claimNumber}"`);
              continue;
            }
            const paymentDate = parseDateVal(row[columnMapping.paymentDate]);
            await db.insert(claimPayments).values({
              claimId: claim.id,
              paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
              paidAmount: String(parseNum(row[columnMapping.paidAmount])),
              adjustmentAmount: columnMapping.adjustmentAmount ? String(parseNum(row[columnMapping.adjustmentAmount])) : "0",
              checkNumber: String(row[columnMapping.checkNumber] || "").trim() || null,
            });
            imported++;
          }
          const alertsTriggered = await evaluateBillingLagAlerts();
          res.json({ imported, updated, errors: errors.slice(0, 20), alertsTriggered });
        } else if (importType === "rates") {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const payer = String(row[columnMapping.payer] || "").trim();
            const cptCode = String(row[columnMapping.cptCode] || "").trim();
            if (!payer || !cptCode) {
              errors.push(`Row ${i + 2}: Missing payer or CPT code`);
              continue;
            }
            const effectiveDate = parseDateVal(row[columnMapping.effectiveDate]);
            await upsertPayerRate({
              payer,
              cptCode,
              expectedRate: String(parseNum(row[columnMapping.expectedRate])),
              effectiveDate: effectiveDate || undefined,
              source: "import",
            });
            imported++;
          }
          const alertsTriggered = await evaluateBillingLagAlerts();
          res.json({ imported, updated, errors: errors.slice(0, 20), alertsTriggered });
        } else {
          return res.status(400).json({ message: "Invalid import type. Use: claims, payments, rates" });
        }
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // ---- Reimbursement Analysis ----

  // GET /api/revenue/underpaid — underpaid claims list with variance
  app.get("/api/revenue/underpaid", READ, async (req, res) => {
    try {
      const minVariance = req.query.minVariance ? parseFloat(qstr(req.query.minVariance as any) || "0") : undefined;
      const result = await storage.getUnderpaidClaims({
        locationId: qstr(req.query.locationId as any),
        payer: qstr(req.query.payer as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
        minVariance,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/revenue/summary — reimbursement summary by payer
  app.get("/api/revenue/summary", READ, async (req, res) => {
    try {
      const result = await storage.getReimbursementSummary({
        locationId: qstr(req.query.locationId as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/revenue/flag-underpaid — run underpayment flagging job
  app.post("/api/revenue/flag-underpaid", WRITE, async (req, res) => {
    try {
      const count = await storage.flagUnderpaidClaims(req.body?.locationId ? { locationId: req.body.locationId } : undefined);
      res.json({ flagged: count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/revenue/rates — upsert a single rate
  app.post("/api/revenue/rates", WRITE, async (req, res) => {
    try {
      const rate = await storage.upsertPayerRate(req.body);
      res.status(201).json(rate);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/revenue/rates/build — build rates from historical claims
  app.post("/api/revenue/rates/build", WRITE, async (req, res) => {
    try {
      const count = await storage.buildRatesFromHistory(req.body?.payer);
      res.json({ ratesBuilt: count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ---- Denial Intelligence ----

  app.get("/api/revenue/underpayments/by-payer", READ, async (req, res) => {
    try {
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
        GROUP BY payer, payer_type
        ORDER BY total_underpaid DESC
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/revenue/underpayments/by-cpt", READ, async (req, res) => {
    try {
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
        GROUP BY cpt_codes
        ORDER BY total_underpaid DESC
        LIMIT 50
      `);
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/revenue/denials/summary — overall denial stats
  app.get("/api/revenue/denials/summary", READ, async (req, res) => {
    try {
      const result = await storage.getDenialSummary({
        locationId: qstr(req.query.locationId as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/revenue/denials/top-codes — top denial codes with counts
  app.get("/api/revenue/denials/top-codes", READ, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(qstr(req.query.limit as any) || "20") : undefined;
      const result = await storage.getTopDenialCodes({
        locationId: qstr(req.query.locationId as any),
        limit,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/revenue/denials/outliers — providers with >2x avg denial rate
  app.get("/api/revenue/denials/outliers", READ, async (req, res) => {
    try {
      const result = await storage.getProviderDenialOutliers({
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/revenue/denials/trends — monthly denial rate trend
  app.get("/api/revenue/denials/trends", READ, async (req, res) => {
    try {
      const months = req.query.months ? parseInt(qstr(req.query.months as any) || "12") : undefined;
      const result = await storage.getDenialTrends({
        locationId: qstr(req.query.locationId as any),
        months,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
