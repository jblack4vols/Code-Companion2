import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, getClientIp } from "./shared";
import os from "os";
import path from "path";
import fs from "fs";

export async function registerImportRoutes(app: Express) {
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

  // Read uploaded file from disk into ExcelJS workbook, then clean up temp file
  async function loadWorkbook(file: Express.Multer.File): Promise<InstanceType<typeof ExcelJS.Workbook>> {
    const workbook = new ExcelJS.Workbook();
    try {
      if (file.originalname.endsWith(".csv")) {
        await workbook.csv.readFile(file.path);
      } else {
        await workbook.xlsx.readFile(file.path);
      }
    } finally {
      fs.unlink(file.path, () => {});
    }
    return workbook;
  }

  app.get("/api/import/template/:type", requireRole("OWNER", "DIRECTOR", "MARKETER"), (req, res) => {
    const type = req.params.type;
    if (type === "physicians") {
      const headers = ["First Name","Last Name","Credentials","NPI","Practice Name","Street Address 1","Street Address 2","City","State","Zip","Phone","Fax","Email","Specialty"];
      const row1 = ["Jane","Smith","MD","1234567890","Valley Orthopedics","123 Main St","Suite 200","Austin","TX","78701","512-555-0100","512-555-0101","jane.smith@example.com","Orthopedic Surgery"];
      const row2 = ["Robert","Johnson","DO","0987654321","Summit Primary Care","456 Oak Ave","","Denver","CO","80202","303-555-0200","303-555-0201","r.johnson@example.com","Family Medicine"];
      const csv = [headers, row1, row2].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=physicians_template.csv");
      return res.send(csv);
    }
    if (type === "referrals") {
      const headers = ["Patient Account Number","Patient Name","Case Title","Case Therapist","Facility","Case Status","Date of Initial Eval","Primary Insurance","Primary Payer Type","Referring Doctor","Referring Doctor NPI","Referral Source","Discharge Date","Discharge Reason","Scheduled Visits","Arrived Visits","Created Date","Date of First Scheduled Visit","Date of First Arrived Visit","Created to Arrived","Discipline","Diagnosis Category"];
      const row1 = ["PAT-001","John Doe","Knee Rehab","Sarah Thompson","Main Street Clinic","Active","2025-01-15","Blue Cross","Commercial","Dr. Jane Smith","1234567890","Physician Referral","","","12","8","2025-01-10","2025-01-12","2025-01-14","4","PT","Musculoskeletal"];
      const row2 = ["PAT-002","Mary Williams","Back Pain","Mike Chen","Downtown PT Center","Scheduled","2025-02-01","Medicare","Medicare","Dr. Robert Johnson","0987654321","Self Referral","","","6","3","2025-01-20","2025-01-22","2025-01-25","5","PT","Spine"];
      const csv = [headers, row1, row2].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=referrals_template.csv");
      return res.send(csv);
    }
    return res.status(400).json({ message: "Invalid template type. Use: physicians, referrals" });
  });

  app.post("/api/import/preview", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const workbook = await loadWorkbook(req.file);
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
      const workbook = await loadWorkbook(req.file);
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

      // Enrich physicians that have an NPI with data from NPPES registry
      const enrichmentStats = { enriched: 0, failed: 0 };
      const NPI_BATCH_SIZE = 10;
      for (let i = 0; i < mapped.length; i += NPI_BATCH_SIZE) {
        const batch = mapped.slice(i, i + NPI_BATCH_SIZE);
        const enrichPromises = batch.map(async (physician) => {
          if (!physician.npi) return;
          try {
            const response = await fetch(
              `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(physician.npi)}&version=2.1`
            );
            if (!response.ok) return;
            const data = await response.json() as any;
            if (data.result_count === 0) return;

            const result = data.results[0];
            const basic = result.basic || {};
            const addr = result.addresses?.find((a: any) => a.address_purpose === "LOCATION") || result.addresses?.[0] || {};
            const taxonomy = result.taxonomies?.find((t: any) => t.primary) || result.taxonomies?.[0];

            // Only fill MISSING fields — don't overwrite CSV data
            if (!physician.firstName && basic.first_name) physician.firstName = basic.first_name;
            if (!physician.lastName && basic.last_name) physician.lastName = basic.last_name;
            if (!physician.credentials && basic.credential) physician.credentials = basic.credential;
            if (!physician.specialty && taxonomy?.desc) physician.specialty = taxonomy.desc;
            if (!physician.primaryOfficeAddress && addr.address_1) {
              physician.primaryOfficeAddress = [addr.address_1, addr.address_2].filter(Boolean).join(", ");
            }
            if (!physician.city && addr.city) physician.city = addr.city;
            if (!physician.state && addr.state) physician.state = addr.state;
            if (!physician.zip && addr.postal_code) physician.zip = addr.postal_code.slice(0, 5);
            if (!physician.phone && addr.telephone_number) physician.phone = addr.telephone_number;
            if (!physician.fax && addr.fax_number) physician.fax = addr.fax_number;

            enrichmentStats.enriched++;
          } catch {
            enrichmentStats.failed++;
          }
        });
        await Promise.all(enrichPromises);
        // Rate-limit: 100ms delay between batches
        if (i + NPI_BATCH_SIZE < mapped.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const result = await storage.bulkUpsertPhysicians(mapped);
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "physician",
        entityId: "bulk",
        detailJson: {
          inserted: result.inserted,
          updated: result.updated,
          total: mapped.length,
          enriched: enrichmentStats.enriched,
          enrichmentFailed: enrichmentStats.failed,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      res.json({ ...result, enriched: enrichmentStats.enriched, enrichmentFailed: enrichmentStats.failed });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/referrals", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const mapping = JSON.parse(req.body.mapping || "{}");
      const workbook = await loadWorkbook(req.file);
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
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/enrich-npis", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      // Fetch physicians that have an NPI but are missing at least one key field
      const allPhysicians = await storage.getPhysicians();
      const candidates = allPhysicians.filter(p =>
        p.npi && (!p.specialty || !p.city || !p.state || !p.zip || !p.credentials)
      );

      const stats = { total: candidates.length, enriched: 0, alreadyComplete: allPhysicians.length - candidates.length, failed: 0 };

      const NPI_BATCH_SIZE = 10;
      for (let i = 0; i < candidates.length; i += NPI_BATCH_SIZE) {
        const batch = candidates.slice(i, i + NPI_BATCH_SIZE);
        const enrichPromises = batch.map(async (physician) => {
          try {
            const response = await fetch(
              `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(physician.npi!)}&version=2.1`
            );
            if (!response.ok) { stats.failed++; return; }
            const data = await response.json() as any;
            if (data.result_count === 0) { stats.failed++; return; }

            const result = data.results[0];
            const basic = result.basic || {};
            const addr = result.addresses?.find((a: any) => a.address_purpose === "LOCATION") || result.addresses?.[0] || {};
            const taxonomy = result.taxonomies?.find((t: any) => t.primary) || result.taxonomies?.[0];

            // Build update with only missing fields
            const updates: Record<string, string> = {};
            if (!physician.credentials && basic.credential) updates.credentials = basic.credential;
            if (!physician.specialty && taxonomy?.desc) updates.specialty = taxonomy.desc;
            if (!physician.primaryOfficeAddress && addr.address_1) {
              updates.primaryOfficeAddress = [addr.address_1, addr.address_2].filter(Boolean).join(", ");
            }
            if (!physician.city && addr.city) updates.city = addr.city;
            if (!physician.state && addr.state) updates.state = addr.state;
            if (!physician.zip && addr.postal_code) updates.zip = addr.postal_code.slice(0, 5);
            if (!physician.phone && addr.telephone_number) updates.phone = addr.telephone_number;
            if (!physician.fax && addr.fax_number) updates.fax = addr.fax_number;

            if (Object.keys(updates).length > 0) {
              await storage.updatePhysician(physician.id, updates as any);
              stats.enriched++;
            }
          } catch {
            stats.failed++;
          }
        });
        await Promise.all(enrichPromises);
        if (i + NPI_BATCH_SIZE < candidates.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "physician",
        entityId: "bulk",
        detailJson: { action: "enrich-npis", ...stats },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json(stats);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/verify-npis", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const { npis } = req.body;
      if (!Array.isArray(npis) || npis.length === 0) {
        return res.status(400).json({ message: "Provide an array of NPIs" });
      }

      const results: Array<{ npi: string; valid: boolean; name?: string; specialty?: string; address?: string; city?: string; state?: string; zip?: string }> = [];

      const batchSize = 10;
      for (let i = 0; i < Math.min(npis.length, 200); i += batchSize) {
        const batch = npis.slice(i, i + batchSize);
        const promises = batch.map(async (npi: string) => {
          try {
            const response = await fetch(
              `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(npi)}&version=2.1`
            );
            if (!response.ok) return { npi, valid: false };
            const data = await response.json() as any;
            if (data.result_count > 0) {
              const r = data.results[0];
              const basic = r.basic || {};
              const addr = r.addresses?.[0] || {};
              return {
                npi,
                valid: true,
                name: `${basic.first_name || ''} ${basic.last_name || ''}`.trim(),
                specialty: r.taxonomies?.[0]?.desc || null,
                address: addr.address_1 || null,
                city: addr.city || null,
                state: addr.state || null,
                zip: addr.postal_code?.slice(0, 5) || null,
              };
            }
            return { npi, valid: false };
          } catch {
            return { npi, valid: false };
          }
        });
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }

      res.json({
        total: results.length,
        valid: results.filter(r => r.valid).length,
        invalid: results.filter(r => !r.valid).length,
        results,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/npi-lookup", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { firstName, lastName, npi } = req.body;
      const params = new URLSearchParams({ version: "2.1", enumeration_type: "NPI-1" });
      if (npi) {
        params.set("number", npi);
      } else if (firstName && lastName) {
        params.set("first_name", firstName);
        params.set("last_name", lastName);
      } else {
        return res.status(400).json({ message: "Provide either npi or firstName+lastName" });
      }

      const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
      if (!response.ok) return res.status(502).json({ message: "NPI Registry unavailable" });
      const data = await response.json() as any;

      const results = (data.results || []).slice(0, 20).map((r: any) => {
        const basic = r.basic || {};
        const locAddr = r.addresses?.find((a: any) => a.address_purpose === "LOCATION") || {};
        const mailAddr = r.addresses?.find((a: any) => a.address_purpose === "MAILING") || {};
        const taxonomy = r.taxonomies?.find((t: any) => t.primary) || r.taxonomies?.[0];
        const orgName = locAddr.organization_name || mailAddr.organization_name || null;
        return {
          npi: r.number,
          firstName: basic.first_name || "",
          lastName: basic.last_name || "",
          credentials: basic.credential || "",
          specialty: taxonomy?.desc || null,
          organizationName: orgName,
          address: [locAddr.address_1, locAddr.address_2].filter(Boolean).join(", ") || null,
          city: locAddr.city || null,
          state: locAddr.state || null,
          zip: locAddr.postal_code?.slice(0, 5) || null,
          phone: locAddr.telephone_number || null,
        };
      });

      res.json({ count: results.length, results });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/bulk-link-offices", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { links } = req.body;
      if (!Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ message: "Provide an array of { physicianId, practiceName, npi? }" });
      }

      let updated = 0;
      let failed = 0;
      const details: any[] = [];

      for (const link of links) {
        try {
          if (!link.physicianId || !link.practiceName) { failed++; continue; }
          const updates: Record<string, any> = { practiceName: link.practiceName };
          if (link.npi) updates.npi = link.npi;
          if (link.address) updates.primaryOfficeAddress = link.address;
          if (link.city) updates.city = link.city;
          if (link.state) updates.state = link.state;
          if (link.zip) updates.zip = link.zip;
          if (link.phone) updates.phone = link.phone;
          if (link.specialty) updates.specialty = link.specialty;
          if (link.credentials) updates.credentials = link.credentials;
          await storage.updatePhysician(link.physicianId, updates as any);
          updated++;
          details.push({ physicianId: link.physicianId, practiceName: link.practiceName, status: "ok" });
        } catch {
          failed++;
          details.push({ physicianId: link.physicianId, status: "error" });
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "physician",
        entityId: "bulk-link",
        detailJson: { action: "bulk-link-offices", updated, failed, count: links.length },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({ updated, failed, total: links.length, details });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
