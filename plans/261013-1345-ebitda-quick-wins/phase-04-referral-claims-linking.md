# Phase 04: Referral-to-Claims Auto-Linking (QW-3)

## Context

- [EBITDA Analysis](../reports/ebitda-improvement-analysis.md) — QW-4
- [Schema](../../shared/schema.ts) — `referrals` (line 154), `claims` (line 716)
- [Storage](../../server/storage-revenue-recovery.ts) — claims queries
- [Storage](../../server/storage-referrals.ts) — referral queries

## Overview

- **Priority:** P1 — foundational for QW-4 (Payer Profitability)
- **Status:** pending
- **Effort:** 2 days
- **Impact:** Enables accurate revenue attribution per referral/physician; replaces `valueEstimate` with actual collections

Join `referrals.patientAccountNumber` to `claims.patientAccountNumber` to show actual collected revenue per referral. Update physician ROI calculations with real claims data.

## Key Insights

- Both tables have `patientAccountNumber`: `referrals.patient_account_number` (line 162) and `claims.patient_account_number` (line 722)
- A single referral can produce multiple claims (multiple visits = multiple dates of service)
- Revenue per referral = SUM of `claims.paidAmount` where `claims.patientAccountNumber = referrals.patientAccountNumber`
- Current `referrals.valueEstimate` is a manual guess — replace display with actual when linked claims exist
- No FK constraint needed — this is a soft link via shared patient account number

## Schema Changes

**File: `shared/schema.ts`** — Add index for join performance:

```ts
// Add to claims table indexes (line ~743):
index("claims_patient_account_idx").on(table.patientAccountNumber),
```

Note: `referrals` already has `index("referral_patient_account_idx")` on `patientAccountNumber` (line 193).

## Storage Methods

**New file: `server/storage-referral-claims.ts`** (~150 lines)

```ts
export interface ReferralClaimsLink {
  referralId: string;
  patientAccountNumber: string;
  patientFullName: string | null;
  referralDate: string;
  physicianId: string | null;
  physicianName: string | null;
  locationId: string;
  locationName: string;
  referralStatus: string;
  valueEstimate: number | null;
  claimCount: number;
  totalBilled: number;
  totalPaid: number;
  totalAdjustments: number;
  totalDenied: number;
  netCollected: number; // totalPaid - totalAdjustments
  variance: number; // netCollected - valueEstimate (when estimate exists)
  firstDos: string | null;
  lastDos: string | null;
}

export interface ReferralClaimsSummary {
  totalReferralsWithClaims: number;
  totalReferralsWithoutClaims: number;
  totalValueEstimated: number;
  totalActualCollected: number;
  estimateAccuracyPct: number; // actual / estimated * 100
  avgRevenuePerReferral: number;
}

export async function getReferralClaimsLinks(filters: {
  locationId?: string;
  locationIds?: string[] | null;
  physicianId?: string;
  dateFrom?: string;
  dateTo?: string;
  linkedOnly?: boolean; // true = only show referrals with claims
  page?: number;
  pageSize?: number;
}): Promise<{ data: ReferralClaimsLink[]; total: number }>

export async function getReferralClaimsSummary(filters: {
  locationId?: string;
  locationIds?: string[] | null;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ReferralClaimsSummary>

export async function getPhysicianActualRevenue(physicianId: string): Promise<{
  totalCollected: number;
  claimCount: number;
  avgRevenuePerReferral: number;
}>
```

Query logic for `getReferralClaimsLinks`:
```sql
SELECT
  r.id AS referral_id,
  r.patient_account_number,
  r.patient_full_name,
  r.referral_date,
  r.physician_id,
  CONCAT(p.last_name, ', ', p.first_name) AS physician_name,
  r.location_id,
  l.name AS location_name,
  r.status AS referral_status,
  r.value_estimate,
  COUNT(c.id)::int AS claim_count,
  COALESCE(SUM(c.billed_amount::numeric), 0) AS total_billed,
  COALESCE(SUM(c.paid_amount::numeric), 0) AS total_paid,
  COALESCE(SUM(c.adjustment_amount::numeric), 0) AS total_adjustments,
  COALESCE(SUM(CASE WHEN c.status = 'DENIED' THEN c.billed_amount::numeric ELSE 0 END), 0) AS total_denied,
  MIN(c.dos) AS first_dos,
  MAX(c.dos) AS last_dos
FROM referrals r
LEFT JOIN claims c ON c.patient_account_number = r.patient_account_number
LEFT JOIN physicians p ON p.id = r.physician_id
LEFT JOIN locations l ON l.id = r.location_id
WHERE r.deleted_at IS NULL
GROUP BY r.id, p.last_name, p.first_name, l.name
ORDER BY r.referral_date DESC
```

Query for `getPhysicianActualRevenue`:
```sql
SELECT
  COALESCE(SUM(c.paid_amount::numeric), 0) AS total_collected,
  COUNT(DISTINCT c.id)::int AS claim_count,
  COUNT(DISTINCT r.id)::int AS referral_count
FROM referrals r
JOIN claims c ON c.patient_account_number = r.patient_account_number
WHERE r.physician_id = $physicianId AND r.deleted_at IS NULL
```
Then: `avgRevenuePerReferral = totalCollected / referralCount`

**File: `server/storage.ts`** — Add to IStorage interface:

```ts
getReferralClaimsLinks(filters: {
  locationId?: string; locationIds?: string[] | null;
  physicianId?: string; dateFrom?: string; dateTo?: string;
  linkedOnly?: boolean; page?: number; pageSize?: number;
}): Promise<{ data: referralClaimsStorage.ReferralClaimsLink[]; total: number }>;

getReferralClaimsSummary(filters: {
  locationId?: string; locationIds?: string[] | null;
  dateFrom?: string; dateTo?: string;
}): Promise<referralClaimsStorage.ReferralClaimsSummary>;

getPhysicianActualRevenue(physicianId: string): Promise<{
  totalCollected: number; claimCount: number; avgRevenuePerReferral: number;
}>;
```

Add import: `import * as referralClaimsStorage from "./storage-referral-claims";`

Add to DatabaseStorage:
```ts
getReferralClaimsLinks = referralClaimsStorage.getReferralClaimsLinks;
getReferralClaimsSummary = referralClaimsStorage.getReferralClaimsSummary;
getPhysicianActualRevenue = referralClaimsStorage.getPhysicianActualRevenue;
```

## API Endpoints

**New file: `server/routes/referral-claims.ts`** (~80 lines)

```ts
export function registerReferralClaimsRoutes(app: Express) {
  const READ = requireRole("OWNER", "DIRECTOR", "ANALYST");

  // GET /api/referral-claims/links — paginated list
  app.get("/api/referral-claims/links", READ, async (req, res) => { ... });

  // GET /api/referral-claims/summary — KPI summary
  app.get("/api/referral-claims/summary", READ, async (req, res) => { ... });

  // GET /api/referral-claims/physician/:id — actual revenue for a physician
  app.get("/api/referral-claims/physician/:id", READ, async (req, res) => { ... });
}
```

**File: `server/routes.ts`** — Register new route module:
```ts
import { registerReferralClaimsRoutes } from "./routes/referral-claims";
// Add after registerRevenueRecoveryRoutes:
registerReferralClaimsRoutes(app);
```

## Frontend

**New file: `client/src/pages/referral-claims-linking.tsx`** (~190 lines)

Components:
- KPI cards: Referrals with Claims, Referrals without Claims, Estimate Accuracy %, Avg Revenue/Referral
- Filter bar: location, physician, date range, toggle (All / Linked Only / Unlinked Only)
- Table: Patient Acct#, Patient, Physician, Location, Referral Date, Estimate, Claims, Billed, Collected, Variance
- Variance column: green if collected > estimate, red if below
- Unlinked referrals highlighted with muted row style

## Routing & Navigation

**File: `client/src/App.tsx`**:
- Lazy import: `const ReferralClaimsLinkingPage = lazy(() => import("@/pages/referral-claims-linking"));`
- Route: `<Route path="/referral-claims" component={guard(ANALYTICS, ReferralClaimsLinkingPage)} />`

**File: `client/src/components/app-sidebar.tsx`**:
- Add to `financeItems`: `{ title: "Referral Revenue", url: "/referral-claims", icon: Link2 }`

## Implementation Steps

- [ ] Add `claims_patient_account_idx` index to `claims` table in `shared/schema.ts`
- [ ] Run `npm run db:push` to apply index
- [ ] Create `server/storage-referral-claims.ts` with query functions
- [ ] Add methods to `IStorage` and `DatabaseStorage` in `server/storage.ts`
- [ ] Create `server/routes/referral-claims.ts` with 3 endpoints
- [ ] Register routes in `server/routes.ts`
- [ ] Create `client/src/pages/referral-claims-linking.tsx`
- [ ] Add route and sidebar nav item
- [ ] Run `npm run check`
- [ ] Test with existing referral + claims data sharing patient account numbers

## Success Criteria

- Referrals with matching claims show actual collected revenue
- Summary KPIs calculate estimate accuracy
- Physician actual revenue endpoint returns correct totals
- Pagination works for large datasets
- Unlinked referrals visible for data quality monitoring

## Risk Assessment

- **Medium risk**: join quality depends on `patientAccountNumber` consistency between referral and claims imports
- NULL or empty `patientAccountNumber` on either side means no match — surface this as "unlinked" count
- Performance: index on `claims.patient_account_number` mitigates slow joins
- No data modification — purely read operations

## Security

- `requireRole("OWNER", "DIRECTOR", "ANALYST")` — financial data access
- Location scoping via `getUserLocationScope()` on list endpoints
- Patient account numbers visible — appropriate for finance roles
