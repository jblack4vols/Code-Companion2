/**
 * Revenue Recovery — CSV/XLSX import endpoints (templates, preview, commit).
 * Split out of revenue-recovery.ts to keep that file focused on query/CRUD.
 * Write access: OWNER, DIRECTOR (preview/commit); READ for template downloads.
 */
import type { Express } from "express";
import os from "os";
import path from "path";
import fs from "fs";
import { requireRole } from "./shared";
import { parseNum, parseDateValue } from "../import-parse";
import { flagUnderpaidClaims, upsertClaim, upsertPayerRate } from "../storage-revenue-recovery";
import { evaluateBillingLagAlerts } from "../billing-lag-alert-engine";

export async function registerRevenueRecoveryImportRoutes(app: Express) {
  const multer = (await import("multer")).default;
  const ExcelJS = (await import("exceljs")).default;

  const uploadDir = path.join(os.tmpdir(), "crm-uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const allowedExtensions = [".csv", ".xlsx", ".xls"];
  const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Only .csv, .xlsx, and .xls files are allowed") as any, false);
      }
    },
  });

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

  // ---- CSV Template Downloads ----
  app.get("/api/revenue/claims/template/:type", READ, (req, res) => {
    const type = req.params.type;
    if (type === "claims") {
      const headers = ["Claim Number","Date of Service","Payer","CPT Code(s)","Units","Billed Amount","Paid Amount","Claim Status","Denial Codes"];
      const row1 = ["CLM-2025-001","2025-01-15","Blue Cross","97110","4","$480.00","$360.00","PAID",""];
      const row2 = ["CLM-2025-002","2025-01-16","Aetna","97140","3","$330.00","$0.00","DENIED","CO-4, PR-1"];
      const csv = [headers, row1, row2].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=claims_template.csv");
      return res.send(csv);
    }
    if (type === "payments") {
      const headers = ["Claim Number","Payment Date","Paid Amount","Adjustment Amount","Check / EFT Number"];
      const row1 = ["CLM-2025-001","2025-02-01","$360.00","$120.00","EFT-88901"];
      const row2 = ["CLM-2025-003","2025-02-05","$275.00","$25.00","CHK-44502"];
      const csv = [headers, row1, row2].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=payments_template.csv");
      return res.send(csv);
    }
    if (type === "rates") {
      const headers = ["Payer","CPT Code","Expected Rate","Effective Date"];
      const row1 = ["Blue Cross","97110","$120.00","2025-01-01"];
      const row2 = ["Aetna","97140","$110.00","2025-01-01"];
      const csv = [headers, row1, row2].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=rates_template.csv");
      return res.send(csv);
    }
    return res.status(400).json({ message: "Invalid template type. Use: claims, payments, rates" });
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
            const dos = parseDateValue(row[columnMapping.dos]);
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
              patientAccountNumber: columnMapping.patientAccountNumber ? String(row[columnMapping.patientAccountNumber] || "").trim() || null : null,
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
            const paymentDate = parseDateValue(row[columnMapping.paymentDate]);
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
            const effectiveDate = parseDateValue(row[columnMapping.effectiveDate]);
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
}
