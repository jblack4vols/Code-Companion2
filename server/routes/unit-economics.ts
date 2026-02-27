/**
 * Unit Economics API routes.
 * Roles: OWNER=full, DIRECTOR=read+manage, ANALYST=read-only, others=403.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, getClientIp, getUserLocationScope } from "./shared";
import { evaluateAlerts, evaluateProviderAlerts } from "../unit-economics-alert-engine";
import os from "os";
import path from "path";
import fs from "fs";

export async function registerUnitEconomicsRoutes(app: Express) {
  const multer = (await import("multer")).default;
  const ExcelJS = (await import("exceljs")).default;

  const uploadDir = path.join(os.tmpdir(), "crm-uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });

  // Read uploaded file from disk into ExcelJS workbook, then clean up temp file
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

  // Suggest column mapping based on import type and headers
  function autoDetectMapping(importType: string, headers: string[]): Record<string, string | null> {
    const lower = headers.map(h => (h || "").toLowerCase());

    function findHeader(keywords: string[]): string | null {
      for (const kw of keywords) {
        const idx = lower.findIndex(h => h.includes(kw));
        if (idx !== -1) return headers[idx];
      }
      return null;
    }

    if (importType === "quickbooks") {
      return {
        locationName: findHeader(["location", "clinic", "site"]),
        periodDate: findHeader(["date", "period", "month"]),
        grossRevenue: findHeader(["revenue", "gross", "income", "total revenue"]),
      };
    }
    if (importType === "payroll") {
      return {
        locationName: findHeader(["location", "clinic", "site"]),
        periodDate: findHeader(["date", "period", "pay period", "week"]),
        laborCost: findHeader(["labor", "payroll", "wages", "salary"]),
        rentCost: findHeader(["rent", "lease"]),
        suppliesCost: findHeader(["supplies", "materials"]),
        otherFixedCosts: findHeader(["other", "overhead", "fixed"]),
      };
    }
    if (importType === "promptbi") {
      return {
        providerName: findHeader(["provider", "therapist", "clinician"]),
        locationName: findHeader(["location", "clinic", "site"]),
        weekStartDate: findHeader(["week", "date", "period"]),
        totalVisits: findHeader(["visits", "patient visits"]),
        totalUnits: findHeader(["units", "total units"]),
        hoursWorked: findHeader(["hours", "hours worked"]),
      };
    }
    return {};
  }

  // Parse numeric value from string or number cell
  function parseNum(val: any): number {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val.replace(/[$,\s]/g, "")) || 0;
    return 0;
  }

  // Parse date from Excel serial, Date object, or string
  function parseDateValue(val: any): string | null {
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

  // GET /api/unit-economics/dashboard — aggregated per-location summary
  app.get(
    "/api/unit-economics/dashboard",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        // Non-admin with no location assignments — return empty results
        if (locationScope !== null && locationScope.length === 0) {
          return res.json([]);
        }
        const data = await storage.getUnitEconomicsDashboard(locationScope ?? undefined);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/location/:id — time series + providers for one location
  app.get(
    "/api/unit-economics/location/:id",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationScope = await getUserLocationScope(req);
        const locationId = String(req.params.id);
        // Non-admin: verify user has access to the requested location
        if (locationScope !== null && !locationScope.includes(locationId)) {
          return res.status(403).json({ message: "Forbidden: no access to this location" });
        }
        const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
        const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
        const data = await storage.getUnitEconomicsLocationDetail(locationId, dateFrom, dateTo);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/providers — leaderboard across locations
  app.get(
    "/api/unit-economics/providers",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const dateFrom = req.query.dateFrom as string | undefined;
        const dateTo = req.query.dateTo as string | undefined;
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getProviderProductivityLeaderboard(dateFrom, dateTo, locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/forecast — directional revenue forecast per location
  app.get(
    "/api/unit-economics/forecast",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getUnitEconomicsForecast(locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/financials — manual single-record entry
  app.post(
    "/api/unit-economics/financials",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const result = await storage.upsertClinicFinancial(req.body);
        const alertCount = await evaluateAlerts(result.locationId);
        await storage.createAuditLog({
          userId: req.session.userId!,
          action: "CREATE",
          entity: "ClinicFinancial",
          entityId: result.id,
          detailJson: { ...req.body, alertsTriggered: alertCount },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });
        res.json({ financial: result, alertsTriggered: alertCount });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/alerts — list financial alerts
  app.get(
    "/api/unit-economics/alerts",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const acknowledged =
          req.query.acknowledged === "true" ? true :
          req.query.acknowledged === "false" ? false :
          undefined;
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getFinancialAlerts({ locationId, acknowledged });
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/alerts/:id/acknowledge
  app.post(
    "/api/unit-economics/alerts/:id/acknowledge",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const alert = await storage.acknowledgeFinancialAlert(String(req.params.id), req.session.userId!);
        if (!alert) return res.status(404).json({ message: "Alert not found" });
        res.json(alert);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/targets
  app.get(
    "/api/unit-economics/targets",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getFinancialTargets(locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // PATCH /api/unit-economics/targets — bulk upsert targets (OWNER only)
  app.patch(
    "/api/unit-economics/targets",
    requireRole("OWNER"),
    async (req, res) => {
      try {
        const targets = req.body.targets;
        if (!Array.isArray(targets)) {
          return res.status(400).json({ message: "targets array required" });
        }
        const results = await Promise.all(targets.map((t: any) => storage.upsertFinancialTarget(t)));
        await storage.createAuditLog({
          userId: req.session.userId!,
          action: "UPDATE",
          entity: "FinancialTargets",
          entityId: "bulk",
          detailJson: { count: results.length },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });
        res.json(results);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/alerts/evaluate — manually trigger alert engine (OWNER/DIRECTOR)
  app.post(
    "/api/unit-economics/alerts/evaluate",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const locationId = req.body.locationId as string | undefined;
        const [locationAlerts, providerAlerts] = await Promise.all([
          evaluateAlerts(locationId),
          evaluateProviderAlerts(),
        ]);
        res.json({ locationAlerts, providerAlerts, total: locationAlerts + providerAlerts });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/financials/preview — parse file headers + sample rows
  app.post(
    "/api/unit-economics/financials/preview",
    requireRole("OWNER", "DIRECTOR"),
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const importType = req.body.importType || "quickbooks";
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
          suggestedMapping: autoDetectMapping(importType, headers.filter(Boolean)),
        });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/financials/import — commit parsed rows to DB
  app.post(
    "/api/unit-economics/financials/import",
    requireRole("OWNER", "DIRECTOR"),
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const importType = req.body.importType;
        const columnMapping = JSON.parse(req.body.columnMapping || "{}");
        const periodType = req.body.periodType || "WEEKLY";

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

        const allLocations = await storage.getLocations();
        const locationMap = new Map(allLocations.map(l => [l.name.toLowerCase().trim(), l.id]));

        let inserted = 0;
        const updated = 0;
        const errors: string[] = [];

        if (importType === "quickbooks" || importType === "payroll") {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const locName = String(row[columnMapping.locationName] || "").trim().toLowerCase();
            const locationId = locationMap.get(locName);
            if (!locationId) {
              errors.push(`Row ${i + 2}: Unknown location "${row[columnMapping.locationName]}"`);
              continue;
            }
            const periodDate = parseDateValue(row[columnMapping.periodDate]);
            if (!periodDate) {
              errors.push(`Row ${i + 2}: Invalid date`);
              continue;
            }

            const entry: any = {
              locationId,
              periodDate,
              periodType: periodType as any,
              grossRevenue: importType === "quickbooks" ? String(parseNum(row[columnMapping.grossRevenue])) : "0",
              totalVisits: 0,
              totalUnits: 0,
              laborCost: importType === "payroll" ? String(parseNum(row[columnMapping.laborCost])) : "0",
              rentCost: importType === "payroll" ? String(parseNum(row[columnMapping.rentCost])) : "0",
              suppliesCost: importType === "payroll" ? String(parseNum(row[columnMapping.suppliesCost])) : "0",
              otherFixedCosts: importType === "payroll" ? String(parseNum(row[columnMapping.otherFixedCosts])) : "0",
              netContribution: "0",
              source: importType,
            };
            await storage.upsertClinicFinancial(entry);
            inserted++;
          }
        } else if (importType === "promptbi") {
          // Resolve users by name for provider matching
          const allUsers = await storage.getUsers();
          const userMap = new Map(allUsers.map(u => [u.name.toLowerCase().trim(), u.id]));

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const locName = String(row[columnMapping.locationName] || "").trim().toLowerCase();
            const locationId = locationMap.get(locName);
            if (!locationId) {
              errors.push(`Row ${i + 2}: Unknown location`);
              continue;
            }
            const provName = String(row[columnMapping.providerName] || "").trim().toLowerCase();
            const userId = userMap.get(provName);
            if (!userId) {
              errors.push(`Row ${i + 2}: Unknown provider "${row[columnMapping.providerName]}"`);
              continue;
            }
            const weekStart = parseDateValue(row[columnMapping.weekStartDate]);
            if (!weekStart) {
              errors.push(`Row ${i + 2}: Invalid date`);
              continue;
            }

            await storage.upsertProviderProductivity({
              userId,
              locationId,
              weekStartDate: weekStart,
              totalVisits: parseNum(row[columnMapping.totalVisits]),
              totalUnits: parseNum(row[columnMapping.totalUnits]),
              hoursWorked: parseNum(row[columnMapping.hoursWorked]),
              unitsPerHour: 0,
              revenueGenerated: "0",
              revenueTarget: "0",
            });
            inserted++;
          }
        } else {
          return res.status(400).json({ message: "Invalid import type" });
        }

        const alertCount = await evaluateAlerts();

        await storage.createAuditLog({
          userId: req.session.userId!,
          action: "IMPORT",
          entity: "UnitEconomics",
          entityId: importType,
          detailJson: { importType, inserted, updated, errors: errors.length, alertsTriggered: alertCount },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });

        res.json({ imported: inserted, updated, errors: errors.slice(0, 20), alertsTriggered: alertCount });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );
}
