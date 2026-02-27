# Phase 06: Data Import (Claims, Payments, Denials)

## Context Links
- [Phase 01 - Data Model](./phase-01-data-model.md)
- [Existing import pattern](../../server/routes/import.ts)
- [Existing unit economics import](../../server/routes/unit-economics.ts) (lines 292-462)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 4h
- **Depends on:** Phase 01 (schema)
- CSV/Excel import for claims, payment/remittance data, denial codes, and payer rate schedules
- Follow existing multer + ExcelJS pattern with preview -> column mapping -> import flow

## Key Insights
- Existing import pattern: upload file, preview headers + sample rows, user maps columns, then commit import
- Claims typically exported from Prompt EMR or billing system as CSV
- Payment data comes from clearinghouse ERA files exported as CSV
- Column auto-detection: match common header names to expected fields
- Upsert by `claimNumber` for claims, append-only for payments
- After import, trigger revenue recovery alert engine

## Import Types

### 1. Claims Import
Source: Billing system / EMR export (CSV)

**Expected columns:**
| Target Field | Common Headers |
|-------------|---------------|
| claimNumber | claim number, claim #, claim_id, clm_num |
| locationName | location, clinic, facility, site |
| providerName | provider, therapist, clinician, rendering_provider |
| patientAccountNumber | patient account, account #, acct_num |
| patientName | patient name, patient, pt_name |
| payer | payer, insurance, carrier, plan_name |
| payerType | payer type, ins_type |
| dateOfService | dos, date of service, service_date |
| cptCodes | cpt, cpt codes, procedure codes, cpt_code |
| billedAmount | billed, charges, billed_amount, total_charges |
| submissionDate | submission date, filed date, submit_date |
| status | status, claim_status |

**CPT code parsing:** Accept comma-separated string `"97110, 97140"` or single code `"97110"`. Store as JSONB array.

### 2. Payments/Remittance Import
Source: Clearinghouse ERA export or manual spreadsheet

**Expected columns:**
| Target Field | Common Headers |
|-------------|---------------|
| claimNumber | claim number, claim #, clm_num |
| paidAmount | paid, payment, allowed, paid_amount |
| adjustmentAmount | adjustment, adj_amount, write_off |
| paymentDate | payment date, paid date, check_date |
| checkOrEftNumber | check #, eft #, trace_number |
| denialCodes | denial codes, carc, reason_codes |
| adjustmentCodes | adjustment codes, carc_codes |
| remarkCodes | remark codes, rarc, rarc_codes |

**Denial detection:** If denialCodes is non-empty or paidAmount = 0 with adjustmentAmount > 0, set `isDenial = true`.

### 3. Payer Rate Schedule Import
Source: Contract rate sheets or manually built spreadsheet

**Expected columns:**
| Target Field | Common Headers |
|-------------|---------------|
| payer | payer, insurance, carrier |
| cptCode | cpt, cpt code, procedure |
| expectedRate | rate, expected, contracted_rate, allowed_amount |
| effectiveDate | effective date, start date, eff_date |

### 4. Denial Code Lookup Import
Source: CMS CARC/RARC code list (one-time seed)

**Expected columns:**
| Target Field | Common Headers |
|-------------|---------------|
| code | code, carc, rarc, reason_code |
| codeType | type, code_type (CARC/RARC) |
| description | description, reason, desc |
| category | category, group |

## Route File

### File: `server/routes/revenue-recovery-import.ts`

Separate from main routes to keep files under 200 lines. Uses same multer + ExcelJS pattern.

```typescript
export async function registerRevenueRecoveryImportRoutes(app: Express)
```

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/api/revenue-recovery/import/preview` | OWNER,DIRECTOR | Preview file headers + sample rows |
| POST | `/api/revenue-recovery/import/claims` | OWNER,DIRECTOR | Import claims from CSV/Excel |
| POST | `/api/revenue-recovery/import/payments` | OWNER,DIRECTOR | Import payment/remittance data |
| POST | `/api/revenue-recovery/import/rates` | OWNER | Import payer rate schedule |
| POST | `/api/revenue-recovery/import/denial-codes` | OWNER | Import denial code lookup |

### Request Format (all imports)

Multipart form data:
- `file`: CSV or Excel file
- `importType`: `claims` | `payments` | `rates` | `denial-codes`
- `columnMapping`: JSON string mapping target fields to file column names

### Preview Response

```json
{
  "headers": ["Claim #", "Patient", "DOS", "CPT", "Billed", "Payer"],
  "sampleRows": [
    { "Claim #": "CLM-001", "Patient": "Doe, John", "DOS": "2026-02-10", ... }
  ],
  "totalRows": 245,
  "importType": "claims",
  "suggestedMapping": {
    "claimNumber": "Claim #",
    "patientName": "Patient",
    "dateOfService": "DOS",
    "cptCodes": "CPT",
    "billedAmount": "Billed",
    "payer": "Payer"
  }
}
```

### Import Response

```json
{
  "imported": 230,
  "updated": 12,
  "errors": [
    "Row 15: Unknown location \"Clinic X\"",
    "Row 42: Invalid date format"
  ],
  "alertsTriggered": 3
}
```

## Auto-Detection Function

```typescript
function autoDetectClaimMapping(headers: string[]): Record<string, string | null> {
  const lower = headers.map(h => (h || "").toLowerCase().trim());

  function findHeader(keywords: string[]): string | null {
    for (const kw of keywords) {
      const idx = lower.findIndex(h => h.includes(kw));
      if (idx !== -1) return headers[idx];
    }
    return null;
  }

  return {
    claimNumber: findHeader(["claim number", "claim #", "claim_id", "clm"]),
    locationName: findHeader(["location", "clinic", "facility", "site"]),
    providerName: findHeader(["provider", "therapist", "clinician", "rendering"]),
    patientName: findHeader(["patient name", "patient", "pt_name"]),
    patientAccountNumber: findHeader(["patient account", "account #", "acct"]),
    payer: findHeader(["payer", "insurance", "carrier", "plan"]),
    dateOfService: findHeader(["dos", "date of service", "service_date", "service date"]),
    cptCodes: findHeader(["cpt", "procedure", "proc_code"]),
    billedAmount: findHeader(["billed", "charges", "total_charges", "charge"]),
    submissionDate: findHeader(["submission", "filed", "submit"]),
  };
}
```

## Claims Import Logic

```typescript
// For each row:
// 1. Resolve locationName -> locationId (same pattern as referral import)
// 2. Resolve providerName -> userId (fuzzy match against users table)
// 3. Parse dateOfService, submissionDate
// 4. Parse cptCodes: split comma-separated string into array
// 5. Parse billedAmount as numeric
// 6. Compute expectedAmount from payer_rate_schedule if rates exist
// 7. Upsert by claimNumber
```

## Payment Import Logic

```typescript
// For each row:
// 1. Look up claim by claimNumber (skip if not found)
// 2. Parse paidAmount, adjustmentAmount
// 3. Parse denialCodes: split comma-separated string into array
// 4. Set isDenial = denialCodes.length > 0 || (paidAmount === 0 && adjustmentAmount > 0)
// 5. Insert payment record (append-only, no upsert)
// 6. Update claim status based on payment:
//    - If isDenial: status = DENIED
//    - If totalPaid >= billedAmount: status = PAID
//    - If totalPaid > 0 but < billedAmount: status = PARTIAL_PAID
```

## Post-Import Actions

After claims or payments import:
1. Recompute `expectedAmount` for imported claims (if rate schedule exists)
2. Run `evaluateRevenueRecoveryAlerts()` from Phase 04 alert engine
3. Log audit entry

## Implementation Steps

1. Create `server/routes/revenue-recovery-import.ts`
2. Implement preview endpoint with auto-detection for each import type
3. Implement claims import with location/provider resolution
4. Implement payments import with claim lookup + status update
5. Implement rate schedule import
6. Implement denial code import
7. Register routes in `server/routes.ts`
8. Wire post-import alert evaluation
9. Run `npm run check`

## Related Code Files
- **Create:** `server/routes/revenue-recovery-import.ts`
- **Modify:** `server/routes.ts` (register import routes)
- **Modify:** `server/storage-revenue-recovery.ts` (bulk upsert functions)

## Todo List
- [ ] Create import route file with multer setup
- [ ] Implement preview endpoint with auto-detection
- [ ] Implement claims import with location/provider resolution
- [ ] Implement payments import with claim lookup
- [ ] Implement rate schedule import
- [ ] Implement denial code lookup import
- [ ] Wire post-import alert evaluation
- [ ] Register routes
- [ ] Verify `npm run check` passes

## Success Criteria
- [ ] Preview correctly shows headers, sample rows, suggested mapping
- [ ] Claims import resolves locations and providers
- [ ] Payments import links to existing claims and updates status
- [ ] Denial codes parsed and isDenial flag set correctly
- [ ] Rate schedule import populates payer_rate_schedule
- [ ] Errors reported per-row without aborting full import
- [ ] Alerts triggered after import

## Risk Assessment
- **Claim number format:** Different billing systems use different formats; treat as opaque string, enforce uniqueness
- **Payment dedup:** No upsert for payments (append-only); duplicate imports could create duplicate payments. Mitigation: check for existing payment with same claimId + paymentDate + paidAmount before insert
- **Large files:** 50MB limit (matches existing pattern); ExcelJS streams for memory safety
- **Provider matching:** Fuzzy match may produce false positives; unmatched providers logged as warnings, claim still imported with null providerId
