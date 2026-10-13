# Phase 05: Payer Profitability Matrix (QW-4)

## Context

- [EBITDA Analysis](../reports/ebitda-improvement-analysis.md) — QW-1
- [Schema](../../shared/schema.ts) — `claims` (line 716), `payerRateSchedule` (line 764)
- [Storage](../../server/storage-revenue-recovery.ts) — `getReimbursementSummary`, `getClaims`
- [Routes](../../server/routes/revenue-recovery.ts) — revenue API
- **Depends on:** Phase 04 (referral-claims linking for enriched data, but core query works independently)

## Overview

- **Priority:** P2 — informs payer mix strategy worth $42K+/year
- **Status:** pending
- **Effort:** 1.5 days
- **Impact:** Identifies which payers to target and which to negotiate with

Cross-reference `claims` data with `payer_rate_schedule` to build a matrix: Payer x {Avg reimbursement, Denial rate, Collection rate, Avg days to pay, Net revenue/visit}. Color-coded by profitability tier.

## Key Insights

- `claims` table has: `payer`, `payerType`, `billedAmount`, `paidAmount`, `expectedAmount`, `status`, `dos`, `submissionDate`, `paymentDate`, `units`
- `payerRateSchedule` has: `payer`, `cptCode`, `expectedRate` — used for variance analysis
- `getReimbursementSummary` in `storage-revenue-recovery.ts` already groups by payer with `totalBilled`, `totalPaid`, `totalExpected`, `avgRealizationPct` — extend this pattern
- Denial rate = COUNT(status='DENIED') / COUNT(*) per payer
- Days to pay = AVG(payment_date - submission_date) per payer
- Net revenue/visit = SUM(paid_amount) / SUM(units) per payer

## Schema Changes

None required. All data exists in `claims` and `payer_rate_schedule`.

## Storage Methods

**File: `server/storage-revenue-recovery.ts`** — Add new exported types and function:

```ts
export interface PayerProfitabilityEntry {
  payer: string;
  payerType: string | null;
  claimCount: number;
  totalUnits: number;
  totalBilled: number;
  totalPaid: number;
  totalExpected: number;
  avgReimbursementPerUnit: number;    // totalPaid / totalUnits
  avgBilledPerUnit: number;           // totalBilled / totalUnits
  realizationPct: number;             // totalPaid / totalBilled * 100
  collectionPct: number;              // totalPaid / totalExpected * 100
  denialCount: number;
  denialRate: number;                 // denialCount / claimCount * 100
  avgDaysToPay: number;               // AVG(payment_date - submission_date)
  netRevenuePerVisit: number;         // totalPaid / unique DOS count
  underpaidCount: number;
  totalUnderpaid: number;
  profitabilityTier: "HIGH" | "MEDIUM" | "LOW" | "UNPROFITABLE";
}

export async function getPayerProfitabilityMatrix(filters?: {
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
  payerType?: string;
}): Promise<PayerProfitabilityEntry[]>
```

Query logic:
```sql
SELECT
  payer,
  payer_type,
  COUNT(*)::int AS claim_count,
  COALESCE(SUM(units), 0)::int AS total_units,
  COALESCE(SUM(billed_amount::numeric), 0) AS total_billed,
  COALESCE(SUM(paid_amount::numeric), 0) AS total_paid,
  COALESCE(SUM(expected_amount::numeric), 0) AS total_expected,
  COUNT(*) FILTER (WHERE status = 'DENIED')::int AS denial_count,
  COUNT(*) FILTER (WHERE is_underpaid = true)::int AS underpaid_count,
  COALESCE(SUM(underpaid_amount::numeric) FILTER (WHERE is_underpaid = true), 0) AS total_underpaid,
  AVG(
    CASE WHEN payment_date IS NOT NULL AND submission_date IS NOT NULL
    THEN (payment_date::date - submission_date::date) END
  )::numeric AS avg_days_to_pay,
  COUNT(DISTINCT dos) AS unique_dos_count
FROM claims
WHERE payer IS NOT NULL
GROUP BY payer, payer_type
ORDER BY SUM(paid_amount::numeric) DESC
```

Derived fields (calculated in JS after query):
- `avgReimbursementPerUnit = totalPaid / totalUnits` (guard div-by-zero)
- `realizationPct = totalPaid / totalBilled * 100`
- `collectionPct = totalPaid / totalExpected * 100` (when expected > 0)
- `denialRate = denialCount / claimCount * 100`
- `netRevenuePerVisit = totalPaid / uniqueDosCount`
- `profitabilityTier`: HIGH (realization >= 85% AND denial <= 5%), MEDIUM (realization >= 70%), LOW (realization >= 50%), UNPROFITABLE (below 50%)

**File: `server/storage.ts`** — Add to IStorage interface:

```ts
getPayerProfitabilityMatrix(filters?: {
  locationId?: string; dateFrom?: string; dateTo?: string; payerType?: string;
}): Promise<revenueRecoveryStorage.PayerProfitabilityEntry[]>;
```

Add to DatabaseStorage:
```ts
getPayerProfitabilityMatrix = revenueRecoveryStorage.getPayerProfitabilityMatrix;
```

Re-export type:
```ts
export type { PayerProfitabilityEntry } from "./storage-revenue-recovery";
```

## API Endpoint

**File: `server/routes/revenue-recovery.ts`** — Add endpoint:

```ts
// GET /api/revenue/payer-profitability
// Roles: OWNER, DIRECTOR, ANALYST
app.get("/api/revenue/payer-profitability", READ, async (req, res) => {
  const locationId = qstr(req.query.locationId);
  const dateFrom = qstr(req.query.dateFrom);
  const dateTo = qstr(req.query.dateTo);
  const payerType = qstr(req.query.payerType);
  const data = await storage.getPayerProfitabilityMatrix({
    locationId, dateFrom, dateTo, payerType,
  });
  res.json(data);
});
```

## Frontend

**New file: `client/src/pages/payer-profitability.tsx`** (~190 lines)

Components:
- Filter bar: location, date range, payer type (COMMERCIAL/MEDICARE/MEDICAID/CASH/OTHER)
- Matrix table with columns:
  - Payer (name)
  - Type (badge)
  - Claims
  - Avg Reimb/Unit ($)
  - Realization %
  - Denial Rate %
  - Avg Days to Pay
  - Net Rev/Visit ($)
  - Underpaid ($)
  - Profitability (tier badge)
- Color coding per cell:
  - Realization %: green >= 85, yellow >= 70, red < 70
  - Denial Rate: green <= 5%, yellow <= 15%, red > 15%
  - Days to Pay: green <= 30, yellow <= 45, red > 45
- Profitability tier badge: HIGH=green, MEDIUM=yellow, LOW=orange, UNPROFITABLE=red
- Sort by any column (client-side, dataset is small — one row per payer)
- Summary row at bottom with practice-wide totals

Data fetching:
```ts
const { data, isLoading } = useQuery({
  queryKey: ["/api/revenue/payer-profitability", locationId, dateFrom, dateTo, payerType],
  queryFn: () => apiRequest(
    `/api/revenue/payer-profitability?locationId=${locationId || ""}&dateFrom=${dateFrom || ""}&dateTo=${dateTo || ""}&payerType=${payerType || ""}`
  ).then(r => r.json()),
});
```

## Routing & Navigation

**File: `client/src/App.tsx`**:
- Lazy import: `const PayerProfitabilityPage = lazy(() => import("@/pages/payer-profitability"));`
- Route: `<Route path="/revenue/payer-profitability" component={guard(ANALYTICS, PayerProfitabilityPage)} />`

**File: `client/src/components/app-sidebar.tsx`**:
- Add to `financeItems` (after "Revenue Dashboard"): `{ title: "Payer Profitability", url: "/revenue/payer-profitability", icon: PieChart }`

## Implementation Steps

- [ ] Add `getPayerProfitabilityMatrix` function to `server/storage-revenue-recovery.ts`
- [ ] Add method to `IStorage` and `DatabaseStorage` in `server/storage.ts`
- [ ] Add GET endpoint in `server/routes/revenue-recovery.ts`
- [ ] Create `client/src/pages/payer-profitability.tsx`
- [ ] Add route in `client/src/App.tsx`
- [ ] Add sidebar nav item in `client/src/components/app-sidebar.tsx`
- [ ] Run `npm run check`
- [ ] Test with existing claims data

## Success Criteria

- Matrix shows one row per payer with all profitability metrics
- Color coding highlights problematic payers (high denial, low realization)
- Profitability tiers correctly categorize payers
- Location filter works to compare payer performance across clinics
- Date range filter narrows analysis window

## Risk Assessment

- **Low risk**: read-only aggregation on existing `claims` data
- Payers with very few claims may show skewed metrics — consider a minimum claims threshold (e.g., 5) or a footnote
- `expectedAmount` may be NULL if `payer_rate_schedule` is not populated for all payers — `collectionPct` falls back to realization %
- Phase 04 (referral-claims linking) enriches the data but is not a hard dependency — this phase can ship independently

## Security

- `requireRole("OWNER", "DIRECTOR", "ANALYST")` — financial data
- No patient-level data exposed — aggregated by payer
- Location filter optional (practice-wide view by default)
