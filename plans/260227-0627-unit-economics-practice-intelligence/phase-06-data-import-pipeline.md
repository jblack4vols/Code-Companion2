# Phase 6: Data Import Pipeline

## Context Links
- Existing import pattern: `server/routes/import.ts` (multer + ExcelJS)
- Backend storage: `phase-03-unit-economics-backend.md` (bulkUpsert methods)
- Alert engine: `server/unit-economics-alert-engine.ts`
- Existing import UI: `client/src/pages/import.tsx`

## Overview
- **Priority:** P2
- **Status:** pending
- **Description:** CSV/Excel import handlers for financial data (QuickBooks revenue, payroll/labor costs, Prompt BI visit data). Includes preview step, column mapping, validation, and alert evaluation post-import.

## Key Insights
- Existing import pipeline uses multer for file upload + ExcelJS for parsing both `.csv` and `.xlsx`
- Pattern: preview endpoint returns headers + sample rows, then commit endpoint processes full file
- Financial imports target `clinic_financials` and `provider_productivity` tables
- Three import types with different column mappings:
  1. **QuickBooks export** -- revenue by location by period
  2. **Payroll export** -- labor costs by location by period
  3. **Prompt BI export** -- visits/units by provider by week
- After import: trigger `evaluateAlerts()` to check thresholds

## Architecture

```
Frontend: unit-economics-data-import.tsx
  1. Select import type (QuickBooks / Payroll / Prompt BI)
  2. Upload file
  3. POST /api/unit-economics/financials/preview  --> preview rows + detected columns
  4. User maps columns (or accepts auto-detected mapping)
  5. POST /api/unit-economics/financials/import    --> parse, validate, upsert, run alerts
  6. Display results summary
```

## Related Code Files

### Files to Create
- `client/src/pages/unit-economics-data-import.tsx` -- import UI

### Files to Modify
- `server/routes/unit-economics.ts` -- add import endpoints

## Implementation Steps

### Step 1: Add Import Endpoints to unit-economics.ts

At the top of the file, add multer setup (follow existing pattern from `server/routes/import.ts`):

```typescript
import os from "os";
import path from "path";
import fs from "fs";

// Inside registerUnitEconomicsRoutes, after other routes:

const multer = (await import("multer")).default;
const ExcelJS = (await import("exceljs")).default;
const uploadDir = path.join(os.tmpdir(), "crm-uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 50 * 1024 * 1024 } });
```

**Note:** Since `registerUnitEconomicsRoutes` is currently sync, either make it `async` (like `registerImportRoutes`) or do a top-level `await import("multer")`.

Make it async:
```typescript
export async function registerUnitEconomicsRoutes(app: Express) {
```

Update `server/routes.ts`:
```typescript
await registerUnitEconomicsRoutes(app);
```

#### Preview Endpoint

```typescript
// POST /api/unit-economics/financials/preview
app.post("/api/unit-economics/financials/preview",
  requireRole("OWNER", "DIRECTOR"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const importType = req.body.importType; // "quickbooks" | "payroll" | "promptbi"

      const workbook = new ExcelJS.Workbook();
      try {
        if (req.file.originalname.endsWith(".csv")) {
          await workbook.csv.readFile(req.file.path);
        } else {
          await workbook.xlsx.readFile(req.file.path);
        }
      } finally {
        fs.unlink(req.file.path, () => {});
      }

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

      // Auto-detect column mapping based on import type
      const suggestedMapping = autoDetectMapping(importType, headers);

      let totalRows = 0;
      worksheet.eachRow(() => totalRows++);

      res.json({
        headers: headers.filter(Boolean),
        sampleRows,
        totalRows: totalRows - 1,
        importType,
        suggestedMapping,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }
);
```

**Auto-detect column mapping:**

```typescript
function autoDetectMapping(
  importType: string,
  headers: string[]
): Record<string, string | null> {
  const lower = headers.map(h => (h || "").toLowerCase());

  if (importType === "quickbooks") {
    return {
      locationName: findHeader(lower, headers, ["location", "clinic", "site"]),
      periodDate: findHeader(lower, headers, ["date", "period", "month"]),
      grossRevenue: findHeader(lower, headers, ["revenue", "gross", "income", "total revenue"]),
    };
  }
  if (importType === "payroll") {
    return {
      locationName: findHeader(lower, headers, ["location", "clinic", "site"]),
      periodDate: findHeader(lower, headers, ["date", "period", "pay period", "week"]),
      laborCost: findHeader(lower, headers, ["labor", "payroll", "wages", "salary"]),
      rentCost: findHeader(lower, headers, ["rent", "lease"]),
      suppliesCost: findHeader(lower, headers, ["supplies", "materials"]),
      otherFixedCosts: findHeader(lower, headers, ["other", "overhead", "fixed"]),
    };
  }
  if (importType === "promptbi") {
    return {
      providerName: findHeader(lower, headers, ["provider", "therapist", "clinician"]),
      locationName: findHeader(lower, headers, ["location", "clinic", "site"]),
      weekStartDate: findHeader(lower, headers, ["week", "date", "period"]),
      totalVisits: findHeader(lower, headers, ["visits", "patient visits"]),
      totalUnits: findHeader(lower, headers, ["units", "total units"]),
      hoursWorked: findHeader(lower, headers, ["hours", "hours worked"]),
    };
  }
  return {};
}

function findHeader(
  lowerHeaders: string[], originalHeaders: string[], keywords: string[]
): string | null {
  for (const kw of keywords) {
    const idx = lowerHeaders.findIndex(h => h.includes(kw));
    if (idx !== -1) return originalHeaders[idx];
  }
  return null;
}
```

#### Import (Commit) Endpoint

```typescript
// POST /api/unit-economics/financials/import
app.post("/api/unit-economics/financials/import",
  requireRole("OWNER", "DIRECTOR"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const importType = req.body.importType;
      const columnMapping = JSON.parse(req.body.columnMapping || "{}");
      const periodType = req.body.periodType || "WEEKLY";

      const workbook = new ExcelJS.Workbook();
      try {
        if (req.file.originalname.endsWith(".csv")) {
          await workbook.csv.readFile(req.file.path);
        } else {
          await workbook.xlsx.readFile(req.file.path);
        }
      } finally {
        fs.unlink(req.file.path, () => {});
      }

      const worksheet = workbook.worksheets[0];
      const headers: string[] = [];
      worksheet.getRow(1).eachCell((cell: any, colNumber: number) => {
        headers[colNumber] = String(cell.value || "").trim();
      });

      // Get all locations for name -> ID mapping
      const allLocations = await storage.getLocations();
      const locationMap = new Map(
        allLocations.map(l => [l.name.toLowerCase().trim(), l.id])
      );

      const rows: Record<string, any>[] = [];
      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) return;
        const obj: Record<string, any> = {};
        row.eachCell((cell: any, colNumber: number) => {
          if (headers[colNumber]) obj[headers[colNumber]] = cell.value;
        });
        rows.push(obj);
      });

      let result: { inserted: number; updated: number; errors: string[] };

      if (importType === "quickbooks" || importType === "payroll") {
        result = await processFinancialImport(
          rows, columnMapping, locationMap, importType, periodType, storage
        );
      } else if (importType === "promptbi") {
        result = await processProviderImport(
          rows, columnMapping, locationMap, storage
        );
      } else {
        return res.status(400).json({ message: "Invalid import type" });
      }

      // Run alert evaluation after import
      const alertCount = await evaluateAlerts();

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "UnitEconomics",
        entityId: importType,
        detailJson: {
          importType, inserted: result.inserted,
          updated: result.updated, errors: result.errors.length,
          alertsTriggered: alertCount,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({
        imported: result.inserted,
        updated: result.updated,
        errors: result.errors.slice(0, 20), // first 20 errors only
        alertsTriggered: alertCount,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  }
);
```

#### Import Processing Functions

```typescript
async function processFinancialImport(
  rows: Record<string, any>[],
  mapping: Record<string, string>,
  locationMap: Map<string, string>,
  importType: string,
  periodType: string,
  storage: IStorage,
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const financials: InsertClinicFinancial[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const locationName = String(row[mapping.locationName] || "").trim().toLowerCase();
    const locationId = locationMap.get(locationName);
    if (!locationId) {
      errors.push(`Row ${i + 2}: Unknown location "${row[mapping.locationName]}"`);
      continue;
    }

    const periodDate = parseDateValue(row[mapping.periodDate]);
    if (!periodDate) {
      errors.push(`Row ${i + 2}: Invalid date "${row[mapping.periodDate]}"`);
      continue;
    }

    const entry: InsertClinicFinancial = {
      locationId,
      periodDate,
      periodType: periodType as any,
      grossRevenue: importType === "quickbooks" ? String(parseNum(row[mapping.grossRevenue])) : "0",
      totalVisits: 0,
      totalUnits: 0,
      laborCost: importType === "payroll" ? String(parseNum(row[mapping.laborCost])) : "0",
      rentCost: importType === "payroll" ? String(parseNum(row[mapping.rentCost])) : "0",
      suppliesCost: importType === "payroll" ? String(parseNum(row[mapping.suppliesCost])) : "0",
      otherFixedCosts: importType === "payroll" ? String(parseNum(row[mapping.otherFixedCosts])) : "0",
      netContribution: "0", // computed after all costs known
      source: importType,
    };

    financials.push(entry);
  }

  const result = await storage.bulkUpsertClinicFinancials(financials);
  return { inserted: result.inserted, updated: result.updated, errors };
}

function parseNum(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[$,\s]/g, "");
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

function parseDateValue(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") {
    // Excel serial date
    const utcDays = Math.floor(val - 25569);
    return new Date(utcDays * 86400000).toISOString().slice(0, 10);
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
```

### Step 2: Create Frontend Import Page

File: `client/src/pages/unit-economics-data-import.tsx`

**Layout:**
```
+------------------------------------------------------------------+
| Import Financial Data                                             |
+------------------------------------------------------------------+
| Step 1: Select Import Type                                        |
| ( ) QuickBooks Revenue Export                                     |
| ( ) Payroll / Cost Data                                           |
| ( ) Prompt BI Visit Data                                          |
+------------------------------------------------------------------+
| Step 2: Upload File                                               |
| [Choose File] (.csv, .xlsx)                                       |
+------------------------------------------------------------------+
| Step 3: Preview & Map Columns                                     |
| Detected columns: [dropdown mapping for each required field]      |
| Preview table: first 5 rows                                       |
+------------------------------------------------------------------+
| Step 4: Period Type                                               |
| [Daily] [Weekly] [Monthly]                                        |
+------------------------------------------------------------------+
| [Import Data]  -->  Results: 52 inserted, 0 updated, 1 alert     |
+------------------------------------------------------------------+
```

**Key component structure:**
```tsx
export default function UnitEconomicsDataImportPage() {
  const [importType, setImportType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [periodType, setPeriodType] = useState("WEEKLY");
  const [importResult, setImportResult] = useState<any>(null);

  // Step 2: Preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("importType", importType);
      const res = await fetch("/api/unit-economics/financials/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) throw new Error("Preview failed");
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setColumnMapping(data.suggestedMapping || {});
    },
  });

  // Step 4: Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("importType", importType);
      formData.append("columnMapping", JSON.stringify(columnMapping));
      formData.append("periodType", periodType);
      const res = await fetch("/api/unit-economics/financials/import", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({
        queryKey: ["/api/unit-economics"],
      });
    },
  });

  // ... render steps based on state
}
```

**Note on CSRF with FormData:** The existing `apiRequest` function sets `Content-Type: application/json`. For file uploads, use raw `fetch` with FormData (no Content-Type header -- browser sets multipart boundary). Must manually include CSRF token header.

Utility to get CSRF token:
```tsx
function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}
```

## Todo List

- [ ] Add multer setup to `unit-economics.ts` (make function async)
- [ ] Update `server/routes.ts` to `await registerUnitEconomicsRoutes(app)`
- [ ] Implement `autoDetectMapping()` helper
- [ ] Implement `POST /api/unit-economics/financials/preview` endpoint
- [ ] Implement `POST /api/unit-economics/financials/import` endpoint
- [ ] Implement `processFinancialImport()` for QuickBooks/payroll
- [ ] Implement `processProviderImport()` for Prompt BI
- [ ] Create `client/src/pages/unit-economics-data-import.tsx`
- [ ] Handle CSRF token in FormData uploads
- [ ] Test import with sample CSV files for each type
- [ ] Verify alerts trigger after import

## Success Criteria

- Preview endpoint returns headers, sample rows, and suggested column mapping
- Import processes QuickBooks CSV: maps to `clinic_financials` with `source: "quickbooks"`
- Import processes payroll CSV: maps costs to `clinic_financials` with `source: "payroll"`
- Import processes Prompt BI CSV: maps to `provider_productivity`
- Unknown location names reported as errors (not silent failures)
- Audit log created for each import
- Alert engine runs post-import and triggers new alerts if thresholds breached
- Frontend shows step-by-step wizard with preview before commit
- Error summary displayed after import

## Risk Assessment

- **Column name variation:** QuickBooks exports vary by version and settings. Auto-detect uses keyword matching; user can override with dropdown selectors.
- **Date format variation:** Excel dates may be serial numbers, ISO strings, or locale-specific. `parseDateValue()` handles all three.
- **Duplicate imports:** Upsert logic (ON CONFLICT) prevents duplicates. Same location+date+periodType overwrites existing values. Acceptable for financial corrections.
- **Large files:** 50MB limit; 5,600 visits/month across 8 clinics = modest data volume. No performance concerns.

## Security Considerations

- File upload restricted to OWNER/DIRECTOR (same as existing import routes)
- Temp files cleaned up immediately after parsing
- CSRF token required for POST endpoints
- Audit log captures import metadata (type, row counts, errors)
- No user-provided content executed; file parsed as data only
