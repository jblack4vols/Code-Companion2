# Phase 03: Practice-Wide EBITDA Rollup (QW-2)

## Context

- [EBITDA Analysis](../reports/ebitda-improvement-analysis.md) — QW-3
- [Schema](../../shared/schema.ts) — `clinicFinancials` table (lines 350-370)
- [Storage](../../server/storage-unit-economics.ts) — `getUnitEconomicsDashboard`, `getClinicFinancials`
- [Routes](../../server/routes/unit-economics.ts) — unit economics API
- [Dashboard](../../client/src/pages/unit-economics-dashboard.tsx) — existing location grid

## Overview

- **Priority:** P1 — executive visibility into practice-level financial health
- **Status:** pending
- **Effort:** 1 day
- **Impact:** Enables owner to see consolidated P&L at a glance

Aggregate `clinic_financials` across all 8 locations into a practice-wide EBITDA summary row plus monthly trend chart. Add as a new section on the existing unit economics dashboard.

## Key Insights

- `clinicFinancials` already has: `grossRevenue`, `laborCost`, `rentCost`, `suppliesCost`, `otherFixedCosts`, `netContribution`, `totalVisits`, `totalUnits`
- EBITDA = `grossRevenue - (laborCost + rentCost + suppliesCost + otherFixedCosts)` = `netContribution`
- Data exists per location per period — aggregation is a SQL SUM
- Best UX: add rollup section to existing `unit-economics-dashboard.tsx` rather than new page
- Monthly trend: group by `periodDate` across all locations, sum metrics

## Schema Changes

None required. All data exists in `clinic_financials`.

## Storage Methods

**File: `server/storage-unit-economics.ts`** — Add new exported types and function:

```ts
export interface EbitdaRollup {
  totalGrossRevenue: number;
  totalLaborCost: number;
  totalRentCost: number;
  totalSuppliesCost: number;
  totalOtherFixedCosts: number;
  totalNetContribution: number; // = EBITDA proxy
  totalVisits: number;
  totalUnits: number;
  revenuePerVisit: number;
  costPerVisit: number;
  laborPercent: number;
  netMarginPct: number;
  locationCount: number;
}

export interface EbitdaTrendEntry {
  periodDate: string;
  grossRevenue: number;
  totalCosts: number;
  netContribution: number;
  netMarginPct: number;
  totalVisits: number;
}

export interface LocationContribution {
  locationId: string;
  locationName: string;
  grossRevenue: number;
  netContribution: number;
  contributionPct: number; // % of total practice EBITDA
}

export async function getEbitdaRollup(filters?: {
  dateFrom?: string;
  dateTo?: string;
  periodType?: string;
}): Promise<{
  summary: EbitdaRollup;
  trend: EbitdaTrendEntry[];
  locationRanking: LocationContribution[];
}>
```

Query logic for `summary`:
```sql
SELECT
  SUM(gross_revenue)::numeric AS total_gross_revenue,
  SUM(labor_cost)::numeric AS total_labor_cost,
  SUM(rent_cost)::numeric AS total_rent_cost,
  SUM(supplies_cost)::numeric AS total_supplies_cost,
  SUM(other_fixed_costs)::numeric AS total_other_fixed_costs,
  SUM(net_contribution)::numeric AS total_net_contribution,
  SUM(total_visits)::int AS total_visits,
  SUM(total_units)::int AS total_units,
  COUNT(DISTINCT location_id)::int AS location_count
FROM clinic_financials
WHERE period_type = $periodType
  AND period_date >= $dateFrom AND period_date <= $dateTo
```

Derived: `revenuePerVisit`, `costPerVisit`, `laborPercent`, `netMarginPct` calculated in JS from sums.

Query for `trend`: same but `GROUP BY period_date ORDER BY period_date ASC`.

Query for `locationRanking`: `GROUP BY location_id` joined with `locations` for name, ordered by `netContribution DESC`.

**File: `server/storage.ts`** — Add to IStorage interface:

```ts
getEbitdaRollup(filters?: {
  dateFrom?: string;
  dateTo?: string;
  periodType?: string;
}): Promise<{
  summary: unitEconomicsStorage.EbitdaRollup;
  trend: unitEconomicsStorage.EbitdaTrendEntry[];
  locationRanking: unitEconomicsStorage.LocationContribution[];
}>;
```

Add to DatabaseStorage:

```ts
getEbitdaRollup = unitEconomicsStorage.getEbitdaRollup;
```

Re-export types:

```ts
export type { EbitdaRollup, EbitdaTrendEntry, LocationContribution } from "./storage-unit-economics";
```

## API Endpoint

**File: `server/routes/unit-economics.ts`** — Add endpoint:

```ts
// GET /api/unit-economics/ebitda-rollup
// Roles: OWNER, DIRECTOR, ANALYST
app.get("/api/unit-economics/ebitda-rollup", READ, async (req, res) => {
  const dateFrom = qstr(req.query.dateFrom);
  const dateTo = qstr(req.query.dateTo);
  const periodType = qstr(req.query.periodType) || "WEEKLY";
  const data = await storage.getEbitdaRollup({ dateFrom, dateTo, periodType });
  res.json(data);
});
```

Note: `READ` middleware is already defined in this file as `requireRole("OWNER", "DIRECTOR", "ANALYST")`.

## Frontend

**Modified file: `client/src/pages/unit-economics-dashboard.tsx`** — Add EBITDA rollup section above the location grid.

New section components (inline, not separate files — keeps it under 200 lines with refactoring):

1. **EBITDA Summary Cards** (top of page, before location table):
   - Total Revenue, Total Costs, EBITDA (net contribution), EBITDA Margin %
   - Each card uses existing `Card`/`CardContent` pattern from the page

2. **EBITDA Trend Chart** (below summary cards):
   - Use Recharts `AreaChart` (already in project dependencies)
   - X-axis: period dates, Y-axis: revenue vs costs vs EBITDA
   - Area fill for revenue (green) and costs (red), line for EBITDA

3. **Location Contribution Ranking** (horizontal bar or sorted list):
   - Each location with its % contribution to total EBITDA
   - Color-coded: green (positive contribution), red (negative)

If the dashboard file exceeds 200 lines, extract the EBITDA section into a separate component file: `client/src/components/ebitda-rollup-section.tsx`.

Data fetching:
```ts
const { data: ebitdaData } = useQuery({
  queryKey: ["/api/unit-economics/ebitda-rollup", dateFrom, dateTo, periodType],
  queryFn: () => apiRequest(
    `/api/unit-economics/ebitda-rollup?periodType=${periodType}&dateFrom=${dateFrom}&dateTo=${dateTo}`
  ).then(r => r.json()),
});
```

## Implementation Steps

- [ ] Add `EbitdaRollup`, `EbitdaTrendEntry`, `LocationContribution` types to `server/storage-unit-economics.ts`
- [ ] Add `getEbitdaRollup` function to `server/storage-unit-economics.ts`
- [ ] Add method to `IStorage` interface and `DatabaseStorage` in `server/storage.ts`
- [ ] Add GET endpoint in `server/routes/unit-economics.ts`
- [ ] Add EBITDA rollup section to `client/src/pages/unit-economics-dashboard.tsx`
- [ ] Extract to `client/src/components/ebitda-rollup-section.tsx` if page exceeds 200 lines
- [ ] Run `npm run check` for type checking
- [ ] Verify with existing clinic_financials data

## Success Criteria

- Summary row shows correct totals across all 8 locations
- Trend chart displays monthly EBITDA over time
- Location ranking shows each location's contribution %
- Period type filter (WEEKLY/MONTHLY) works correctly
- Empty state handled when no financial data exists

## Risk Assessment

- **Very low risk**: read-only aggregation, no schema changes
- If `clinic_financials` has sparse data (not all locations have entries), totals reflect only available data — acceptable
- Recharts dependency already exists in project (used by other dashboards)

## Security

- `requireRole("OWNER", "DIRECTOR", "ANALYST")` — same as existing unit economics routes
- No location scoping needed — EBITDA rollup is practice-wide (executive view)
