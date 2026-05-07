# Tristar 360 — Financial Data Import Formats

All import pages support CSV (.csv) and Excel (.xlsx, .xls) formats.
Column headers are matched automatically — you can use your own header names and map them during upload.

---

## 1. Claims Data Import

**Where:** Finance > Revenue Dashboard > Import Claims (or `/revenue/import`)

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| Claim Number | Yes | CLM-2025-001 | Unique claim identifier |
| Date of Service | Yes | 2025-01-15 | Accepts YYYY-MM-DD or MM/DD/YYYY |
| Payer | No | Blue Cross | Insurance company name |
| CPT Code(s) | No | 97110,97140 | Comma-separated |
| Units | No | 4 | Total units billed |
| Billed Amount | No | $480.00 | Supports $ and commas |
| Paid Amount | No | $360.00 | Leave blank if unpaid |
| Claim Status | No | PAID | SUBMITTED, PAID, PARTIAL, DENIED |
| Denial Codes | No | CO-4 | CARC codes if denied |

**Template download:** Available in the import wizard or `GET /api/revenue/claims/template/claims`

---

## 2. Payment Remittance Import

**Where:** Finance > Revenue Dashboard > Import Claims > "Payment Remittance" type

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| Claim Number | Yes | CLM-2025-001 | Must match existing claim |
| Payment Date | Yes | 2025-02-01 | Date payment received |
| Paid Amount | Yes | $360.00 | Payment amount |
| Adjustment Amount | No | $120.00 | Contractual adjustment |
| Check / EFT Number | No | EFT-88901 | Payment reference |

**Template download:** `GET /api/revenue/claims/template/payments`

---

## 3. Payer Rate Schedule Import

**Where:** Finance > Revenue Dashboard > Import Claims > "Payer Rate Schedule" type

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| Payer | Yes | Blue Cross | Insurance company |
| CPT Code | Yes | 97110 | Single CPT code per row |
| Expected Rate | Yes | $120.00 | Expected reimbursement |
| Effective Date | No | 2025-01-01 | When rate took effect |

**Template download:** `GET /api/revenue/claims/template/rates`

---

## 4. QuickBooks Revenue Import

**Where:** Finance > Unit Economics > Import (or `/unit-economics/import`)

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| Location / Clinic Name | Yes | Tristar PT - Johnson City | Matched by name |
| Period Date | Yes | 2025-01-06 | Start of week/month |
| Gross Revenue | Yes | $12,500.00 | Total revenue for period |
| Total Visits | No | 85 | Patient visits |

---

## 5. Payroll & Cost Import

**Where:** Finance > Unit Economics > Import > "Payroll & Cost" type

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| Location / Clinic Name | Yes | Tristar PT - Johnson City | Matched by name |
| Period Date | Yes | 2025-01-06 | Start of week/month |
| Labor Cost | No | $5,200.00 | Staff wages/salaries |
| Rent Cost | No | $1,100.00 | Facility rent |
| Supplies Cost | No | $280.00 | Clinical supplies |
| Other Fixed Costs | No | $350.00 | Utilities, etc. |

---

## 6. Visit Productivity Import (Prompt BI)

**Where:** Finance > Unit Economics > Import > "Prompt BI Visits" type

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| Provider Name | Yes | Jordan Black | Matched to user accounts |
| Location / Clinic Name | Yes | Tristar PT - Johnson City | Matched by name |
| Week Start Date | Yes | 2025-01-06 | Monday of the week |
| Total Visits | No | 42 | Visits that week |
| Total Units | No | 210 | Units billed |
| Hours Worked | No | 36 | Hours for the week |
| Revenue Generated | No | $5,800.00 | Revenue attributed |

---

## Tips

- Dates can be in most common formats — the system auto-detects
- Dollar amounts can include $ signs and commas — they're stripped automatically
- Location names are matched case-insensitively
- You can map your own column headers to the expected fields in the import wizard
- Download the sample template from the import page to see the exact format
