import type { Express } from "express";
import { storage } from "../storage";
import { Readable } from "stream";
import { requireRole, getClientIp } from "./shared";

export async function registerImportRoutes(app: Express) {
  const multer = (await import("multer")).default;
  const ExcelJS = (await import("exceljs")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  function excelSerialToDate(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400000);
  }

  function worksheetToJson(worksheet: any): Record<string, any>[] {
    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell: any, colNumber: number) => {
      headers[colNumber] = String(cell.value || "").trim();
    });

    const rows: Record<string, any>[] = [];
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return;
      const obj: Record<string, any> = {};
      row.eachCell((cell: any, colNumber: number) => {
        if (headers[colNumber]) {
          obj[headers[colNumber]] = cell.value;
        }
      });
      rows.push(obj);
    });
    return rows;
  }

  function worksheetToArrays(worksheet: any): any[][] {
    const rows: any[][] = [];
    worksheet.eachRow((row: any, _rowNumber: number) => {
      const arr: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
        arr[colNumber - 1] = cell.value;
      });
      rows.push(arr);
    });
    return rows;
  }

  app.post("/api/import/preview", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const workbook = new ExcelJS.Workbook();
      if (req.file.originalname.endsWith(".csv")) {
        await workbook.csv.read(Readable.from(req.file.buffer));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }
      const worksheet = workbook.worksheets[0];
      const sheetName = worksheet.name;
      const rows = worksheetToArrays(worksheet);
      const headers = (rows[0] || []).map((h: any) => String(h || "").trim());
      const sampleRows = rows.slice(1, 6).map(r =>
        headers.reduce((acc: any, h: string, i: number) => { acc[h] = r[i] ?? null; return acc; }, {})
      );
      res.json({ headers, sampleRows, totalRows: rows.length - 1, sheetName });
    } catch (err: any) {
      res.status(400).json({ message: "Failed to parse Excel file: " + err.message });
    }
  });

  app.post("/api/import/physicians", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const mapping = JSON.parse(req.body.mapping || "{}");
      const workbook = new ExcelJS.Workbook();
      if (req.file.originalname.endsWith(".csv")) {
        await workbook.csv.read(Readable.from(req.file.buffer));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }
      const rows = worksheetToJson(workbook.worksheets[0]);

      const customFieldMapping = JSON.parse(req.body.customFieldMapping || "{}");

      const mapped = rows.map(row => {
        const get = (field: string) => {
          const col = mapping[field];
          if (!col) return undefined;
          const val = row[col];
          return val != null ? String(val).trim() : undefined;
        };

        let customFields: Record<string, string> | undefined;
        if (Object.keys(customFieldMapping).length > 0) {
          customFields = {};
          for (const [label, csvHeader] of Object.entries(customFieldMapping)) {
            const val = row[csvHeader as string];
            if (val != null && String(val).trim()) {
              customFields[label] = String(val).trim();
            }
          }
          if (Object.keys(customFields).length === 0) customFields = undefined;
        }

        return {
          firstName: get("firstName") || "",
          lastName: get("lastName") || "",
          credentials: get("credentials") || undefined,
          npi: get("npi") || undefined,
          practiceName: get("practiceName") || undefined,
          primaryOfficeAddress: [get("address1"), get("address2")].filter(Boolean).join(", ") || undefined,
          city: get("city") || undefined,
          state: get("state") || undefined,
          zip: get("zip") || undefined,
          phone: get("phone") || undefined,
          fax: get("fax") || undefined,
          email: get("email") || undefined,
          specialty: get("specialty") || undefined,
          customFields,
          status: "PROSPECT" as const,
          relationshipStage: "NEW" as const,
          priority: "MEDIUM" as const,
        };
      }).filter(r => r.firstName && r.lastName);

      const result = await storage.bulkUpsertPhysicians(mapped);
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "physician",
        entityId: "bulk",
        detailJson: { inserted: result.inserted, updated: result.updated, total: mapped.length },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/import/referrals", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const mapping = JSON.parse(req.body.mapping || "{}");
      const workbook = new ExcelJS.Workbook();
      if (req.file.originalname.endsWith(".csv")) {
        await workbook.csv.read(Readable.from(req.file.buffer));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }
      const rows = worksheetToJson(workbook.worksheets[0]);

      const allLocations = await storage.getLocations();
      const locationCache = new Map<string, string>();

      function parseDate(val: any): string | null {
        if (!val) return null;
        if (val instanceof Date) {
          const y = val.getFullYear(); const m = String(val.getMonth() + 1).padStart(2, "0"); const d = String(val.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
        if (typeof val === "number") {
          const dt = excelSerialToDate(val);
          const y = dt.getUTCFullYear(); const m = String(dt.getUTCMonth() + 1).padStart(2, "0"); const d = String(dt.getUTCDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
        const s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
          const [m, d, y] = s.split("/");
          const yr = y.length === 2 ? "20" + y : y;
          return `${yr}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        }
        return null;
      }

      async function resolveLocation(name: string): Promise<string | null> {
        if (!name) return null;
        if (locationCache.has(name)) return locationCache.get(name)!;
        const found = allLocations.find(l => l.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(l.name.toLowerCase()));
        if (found) { locationCache.set(name, found.id); return found.id; }
        const dbFound = await storage.findLocationByName(name);
        if (dbFound) { locationCache.set(name, dbFound.id); return dbFound.id; }
        return null;
      }

      async function resolvePhysician(doctorName: string, npi?: string): Promise<string | null> {
        if (!doctorName) return null;
        const cleaned = doctorName.replace(/^(Dr\.?\s*|MD\.?\s*)/i, "").trim();
        const parts = cleaned.split(/\s+/);
        if (parts.length < 2) return null;
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ").replace(/,?\s*(MD|DO|PT|DPT|OT|DC|DDS|DMD|PhD|NP|PA|PA-C)\.?$/i, "").trim();
        const found = await storage.findPhysicianByNameAndNpi(firstName, lastName, npi);
        if (found) return found.id;
        const fuzzyResults = await storage.fuzzyFindPhysicians(lastName, firstName);
        if (fuzzyResults.length === 1) return fuzzyResults[0].id;
        return null;
      }

      const customFieldMapping = JSON.parse(req.body.customFieldMapping || "{}");

      const mapped: any[] = [];
      const errors: string[] = [];
      let unmatchedFacilityCount = 0;
      let unmatchedDoctorCount = 0;
      let invalidDateCount = 0;
      const unmatchedFacilities = new Set<string>();
      const unmatchedDoctors = new Set<string>();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const get = (field: string) => {
          const col = mapping[field];
          if (!col) return undefined;
          const val = row[col];
          return val != null ? String(val).trim() || undefined : undefined;
        };
        const getNum = (field: string) => {
          const col = mapping[field];
          if (!col) return undefined;
          const val = row[col];
          return val != null ? Number(val) || 0 : undefined;
        };
        const getRawDate = (field: string) => {
          const col = mapping[field];
          if (!col) return null;
          return row[col];
        };

        const facilityName = get("facility") || "";
        const locationId = await resolveLocation(facilityName);
        if (!locationId) {
          if (facilityName) {
            unmatchedFacilityCount++;
            unmatchedFacilities.add(facilityName);
            errors.push(`Row ${i + 2}: Could not match facility "${facilityName}"`);
          }
          continue;
        }

        const doctorName = get("referringDoctor") || "";
        const doctorNpi = get("referringDoctorNpi");
        const physicianId = await resolvePhysician(doctorName, doctorNpi);
        if (!physicianId && doctorName) {
          unmatchedDoctorCount++;
          unmatchedDoctors.add(doctorName);
        }

        const referralDate = parseDate(getRawDate("createdDate"));
        if (!referralDate) {
          invalidDateCount++;
          errors.push(`Row ${i + 2}: Missing or invalid created date`);
          continue;
        }

        const statusMap: Record<string, string> = {
          "Active": "RECEIVED", "Scheduled": "SCHEDULED", "Discharged": "DISCHARGED",
          "Eval Completed": "EVAL_COMPLETED", "Lost": "LOST",
        };
        const rawStatus = get("caseStatus") || "";
        let status = statusMap[rawStatus] || "RECEIVED";
        if (rawStatus.toLowerCase().includes("discharg")) status = "DISCHARGED";
        else if (rawStatus.toLowerCase().includes("eval")) status = "EVAL_COMPLETED";
        else if (rawStatus.toLowerCase().includes("sched")) status = "SCHEDULED";

        let customFields: Record<string, string> | undefined;
        if (Object.keys(customFieldMapping).length > 0) {
          customFields = {};
          for (const [label, csvHeader] of Object.entries(customFieldMapping)) {
            const val = row[csvHeader as string];
            if (val != null && String(val).trim()) {
              customFields[label] = String(val).trim();
            }
          }
          if (Object.keys(customFields).length === 0) customFields = undefined;
        }

        mapped.push({
          physicianId,
          locationId,
          referralDate,
          patientAccountNumber: get("patientAccountNumber"),
          patientFullName: get("patientName"),
          patientInitialsOrAnonId: get("patientName") ? get("patientName")!.split(" ").map((n: string) => n[0]).join("") : undefined,
          caseTitle: get("caseTitle"),
          caseTherapist: get("caseTherapist"),
          dateOfInitialEval: parseDate(getRawDate("dateOfInitialEval")),
          referralSource: get("referralSource"),
          dischargeDate: parseDate(getRawDate("dischargeDate")),
          dischargeReason: get("dischargeReason"),
          scheduledVisits: getNum("scheduledVisits") ?? 0,
          arrivedVisits: getNum("arrivedVisits") ?? 0,
          discipline: get("discipline"),
          primaryInsurance: get("primaryInsurance"),
          primaryPayerType: get("primaryPayerType"),
          dateOfFirstScheduledVisit: parseDate(getRawDate("dateOfFirstScheduledVisit")),
          dateOfFirstArrivedVisit: parseDate(getRawDate("dateOfFirstArrivedVisit")),
          createdToArrived: getNum("createdToArrived"),
          diagnosisCategory: get("diagnosisCategory"),
          referringProviderName: doctorName || undefined,
          referringProviderNpi: doctorNpi,
          customFields,
          status: status as any,
        });
      }

      const result = await storage.bulkUpsertReferrals(mapped);
      result.errors = [...errors, ...result.errors];
      const summary = {
        ...result,
        totalRows: rows.length,
        unmatchedFacilityCount,
        unmatchedDoctorCount,
        invalidDateCount,
        unmatchedFacilities: Array.from(unmatchedFacilities),
        unmatchedDoctors: Array.from(unmatchedDoctors),
        unlinkedCount: mapped.filter(m => !m.physicianId).length,
      };
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "referral",
        entityId: "bulk",
        detailJson: { inserted: result.inserted, updated: result.updated, total: mapped.length, skipped: errors.length },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
