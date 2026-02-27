# Phase 07: Frontend (React Pages)

## Context Links
- [Phase 02 - Reimbursement API](./phase-02-reimbursement-engine.md)
- [Phase 03 - Denial Intelligence API](./phase-03-denial-intelligence.md)
- [Phase 04 - Billing Lag API](./phase-04-billing-lag-tracker.md)
- [Phase 05 - Appeal Generator API](./phase-05-appeal-generator.md)
- [Existing App.tsx routes](../../client/src/App.tsx)
- [Existing sidebar](../../client/src/components/app-sidebar.tsx)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 5h
- **Depends on:** Phases 2-6 (all API endpoints)
- 6 new pages + sidebar nav section, following existing shadcn/ui + TanStack Query patterns

## Key Insights
- Lazy-loaded pages via `React.lazy()` in `App.tsx`
- TanStack Query default queryFn fetches `queryKey.join("/")`; use custom queryFn for query params
- All pages use shadcn/ui Card, Table, Badge, Button, Select components
- Recharts for charts (already in project)
- Role-based nav filtering via `hasPermission` in sidebar
- Existing unit-economics pages provide good structural templates

## New Pages

### 1. Revenue Recovery Dashboard (`revenue-recovery-dashboard.tsx`)
**Route:** `/revenue-recovery`

Main overview page with 4 summary cards + key charts.

**Layout:**
```
[Summary Cards Row]
  - Total Claims | Underpaid Claims | Denial Rate | Avg Billing Lag

[Two-Column Grid]
  Left: Underpayment by Payer (horizontal bar chart)
  Right: AR Aging Buckets (stacked bar or donut)

[Full Width]
  Denial Rate Trend (line chart, monthly)

[Quick Links]
  - View All Claims | Denial Analysis | Billing Lag | Appeals
```

**Data Sources:**
- `GET /api/revenue-recovery/underpayments/summary`
- `GET /api/revenue-recovery/denials/summary`
- `GET /api/revenue-recovery/billing-lag/summary`
- `GET /api/revenue-recovery/ar-aging`
- `GET /api/revenue-recovery/underpayments/by-payer`
- `GET /api/revenue-recovery/denials/trend`
- `GET /api/revenue-recovery/appeals/summary`

### 2. Claims List (`revenue-recovery-claims.tsx`)
**Route:** `/revenue-recovery/claims`

Paginated, filterable claim table with inline payment status.

**Layout:**
```
[Filter Bar]
  Location | Payer | Status | Date Range | Search (claim # / patient)

[Data Table]
  Columns: Claim # | Patient | DOS | Payer | CPT Codes | Billed | Expected | Paid | Variance | Status
  - Variance column: red badge if underpaid, green if fully paid
  - Status column: colored badge (PAID=green, DENIED=red, PARTIAL_PAID=yellow, etc.)
  - Click row -> expand to show payments + actions

[Expanded Row Detail]
  - Payment history table
  - "Add Payment" button
  - "Generate Appeal" button (if denied/underpaid)
  - Link to claim in billing system (if available)
```

**Data Sources:**
- `GET /api/revenue-recovery/claims?page=1&pageSize=50&...`
- `GET /api/revenue-recovery/claims/:id` (on expand)

### 3. Denial Intelligence (`revenue-recovery-denials.tsx`)
**Route:** `/revenue-recovery/denials`

Multi-tab denial analysis dashboard.

**Layout:**
```
[Filter Bar]
  Location | Provider | Payer | Date Range

[Tab: Overview]
  - Summary cards: Total Denials | Denial Rate | Top Code | Total $ Denied
  - Top 10 Denial Codes table (code, description, count, amount, % of total)
  - Denial Rate Trend chart (line, monthly)

[Tab: By Provider]
  - Provider table with denial rate, outlier flag
  - Highlight rows where isOutlier=true with warning icon
  - Sortable by denial rate

[Tab: By Location]
  - Location table with denial rate + top codes
  - Bar chart comparing clinic denial rates

[Tab: By Payer]
  - Payer table with denial rate + top codes
```

**Data Sources:**
- `GET /api/revenue-recovery/denials/summary`
- `GET /api/revenue-recovery/denials/by-code`
- `GET /api/revenue-recovery/denials/by-provider`
- `GET /api/revenue-recovery/denials/by-location`
- `GET /api/revenue-recovery/denials/by-payer`
- `GET /api/revenue-recovery/denials/trend`

### 4. Billing Lag & AR Aging (`revenue-recovery-billing-lag.tsx`)
**Route:** `/revenue-recovery/billing-lag`

**Layout:**
```
[Summary Cards]
  Avg Billing Lag | Median Billing Lag | Avg Payment Lag | P90 Billing Lag

[Two-Column Grid]
  Left: AR Aging Donut Chart (4 buckets)
  Right: Billing Lag Trend (line chart, monthly avg)

[Tab: By Location]
  - Table: Location | Avg Billing Lag | Avg Payment Lag | Claims | Over Threshold
  - Color-code rows exceeding threshold

[Tab: By Payer]
  - Table: Payer | Avg Billing Lag | Avg Payment Lag | Claims

[Tab: AR Aging Detail]
  - Bucket selector: 0-30 | 31-60 | 61-90 | 90+
  - Table of individual claims in selected bucket
  - Action: "Generate Appeal" for 90+ aged claims
```

**Data Sources:**
- `GET /api/revenue-recovery/billing-lag/summary`
- `GET /api/revenue-recovery/billing-lag/by-location`
- `GET /api/revenue-recovery/billing-lag/by-payer`
- `GET /api/revenue-recovery/billing-lag/trend`
- `GET /api/revenue-recovery/ar-aging`
- `GET /api/revenue-recovery/ar-aging/by-location`
- `GET /api/revenue-recovery/ar-aging/detail?bucket=90%2B`

### 5. Appeals Management (`revenue-recovery-appeals.tsx`)
**Route:** `/revenue-recovery/appeals`

**Layout:**
```
[Summary Cards]
  Total Appeals | Win Rate | Total Recovered | Avg Recovery

[Filter Bar]
  Status (DRAFTED/SUBMITTED/WON/LOST) | Date Range

[Data Table]
  Columns: Claim # | Patient | Payer | Denial Codes | Status | Created | Outcome Amount
  - Click row -> expand to show full appeal text + actions

[Expanded Row]
  - Full generated appeal text (read-only textarea)
  - Status update buttons: Submit | Mark Won | Mark Lost | Mark Expired
  - Outcome amount input (when marking Won)
  - Notes textarea
  - "Copy to Clipboard" button
  - "Regenerate" button (re-run template)

[Template Management Tab]
  - List of appeal templates
  - Create/Edit template form (name, denial code pattern, body textarea)
  - Placeholder reference sidebar
```

**Data Sources:**
- `GET /api/revenue-recovery/appeals/summary`
- `GET /api/revenue-recovery/appeals?page=1&pageSize=50`
- `GET /api/revenue-recovery/appeal-templates`
- `POST /api/revenue-recovery/appeals/generate`
- `PATCH /api/revenue-recovery/appeals/:id/status`

### 6. Revenue Recovery Import (`revenue-recovery-import.tsx`)
**Route:** `/revenue-recovery/import`

Follow existing `unit-economics-data-import.tsx` pattern closely.

**Layout:**
```
[Import Type Selector]
  Claims | Payments/Remittance | Payer Rate Schedule | Denial Codes

[Step 1: Upload]
  - Drag-and-drop file upload zone
  - Accept .csv, .xlsx

[Step 2: Preview + Column Mapping]
  - Sample rows table
  - Dropdown selectors for each target field -> file column
  - Auto-detected suggestions pre-filled

[Step 3: Import Results]
  - Success/error counts
  - Error details table
  - Alerts triggered count
```

**Data Sources:**
- `POST /api/revenue-recovery/import/preview`
- `POST /api/revenue-recovery/import/claims`
- `POST /api/revenue-recovery/import/payments`
- `POST /api/revenue-recovery/import/rates`
- `POST /api/revenue-recovery/import/denial-codes`

## Sidebar Navigation

Add new section to `client/src/components/app-sidebar.tsx`:

```typescript
const revenueRecoveryItems = [
  { title: "Recovery Dashboard", url: "/revenue-recovery", icon: DollarSign },
  { title: "Claims", url: "/revenue-recovery/claims", icon: FileText },
  { title: "Denial Analysis", url: "/revenue-recovery/denials", icon: AlertTriangle },
  { title: "Billing Lag", url: "/revenue-recovery/billing-lag", icon: Clock },
  { title: "Appeals", url: "/revenue-recovery/appeals", icon: FileCheck },
  { title: "Import Claims", url: "/revenue-recovery/import", icon: Upload },
];
```

Visible to: OWNER, DIRECTOR, ANALYST (read-only for ANALYST; import hidden)

Section label: **"Revenue Recovery"** -- placed after "Finance" section in sidebar.

## App.tsx Route Registration

```typescript
const RevenueRecoveryDashboardPage = lazy(() => import("@/pages/revenue-recovery-dashboard"));
const RevenueRecoveryClaimsPage = lazy(() => import("@/pages/revenue-recovery-claims"));
const RevenueRecoveryDenialsPage = lazy(() => import("@/pages/revenue-recovery-denials"));
const RevenueRecoveryBillingLagPage = lazy(() => import("@/pages/revenue-recovery-billing-lag"));
const RevenueRecoveryAppealsPage = lazy(() => import("@/pages/revenue-recovery-appeals"));
const RevenueRecoveryImportPage = lazy(() => import("@/pages/revenue-recovery-import"));

// In AuthenticatedRouter:
<Route path="/revenue-recovery" component={RevenueRecoveryDashboardPage} />
<Route path="/revenue-recovery/claims" component={RevenueRecoveryClaimsPage} />
<Route path="/revenue-recovery/denials" component={RevenueRecoveryDenialsPage} />
<Route path="/revenue-recovery/billing-lag" component={RevenueRecoveryBillingLagPage} />
<Route path="/revenue-recovery/appeals" component={RevenueRecoveryAppealsPage} />
<Route path="/revenue-recovery/import" component={RevenueRecoveryImportPage} />
```

## Shared Components

Consider extracting if reused across pages:

- `ClaimStatusBadge` -- colored badge for claim status
- `AppealStatusBadge` -- colored badge for appeal status
- `VarianceBadge` -- red/green badge showing underpayment amount
- `DateRangeFilter` -- reusable date range picker (may already exist)

## Implementation Steps

1. Create all 6 page files
2. Add lazy imports and routes in `App.tsx`
3. Add sidebar section in `app-sidebar.tsx`
4. Implement dashboard page first (depends on all summary APIs)
5. Implement claims list with expandable rows
6. Implement denial intelligence with tabs
7. Implement billing lag with AR aging
8. Implement appeals management with template editor
9. Implement import page (follow existing import page pattern)
10. Run `npm run check`

## Related Code Files
- **Create:** `client/src/pages/revenue-recovery-dashboard.tsx`
- **Create:** `client/src/pages/revenue-recovery-claims.tsx`
- **Create:** `client/src/pages/revenue-recovery-denials.tsx`
- **Create:** `client/src/pages/revenue-recovery-billing-lag.tsx`
- **Create:** `client/src/pages/revenue-recovery-appeals.tsx`
- **Create:** `client/src/pages/revenue-recovery-import.tsx`
- **Modify:** `client/src/App.tsx`
- **Modify:** `client/src/components/app-sidebar.tsx`

## Todo List
- [ ] Create revenue-recovery-dashboard.tsx
- [ ] Create revenue-recovery-claims.tsx
- [ ] Create revenue-recovery-denials.tsx
- [ ] Create revenue-recovery-billing-lag.tsx
- [ ] Create revenue-recovery-appeals.tsx
- [ ] Create revenue-recovery-import.tsx
- [ ] Add routes to App.tsx
- [ ] Add sidebar nav section
- [ ] Verify all pages render without errors
- [ ] Verify `npm run check` passes

## Success Criteria
- [ ] All 6 pages load and display data from APIs
- [ ] Dashboard shows summary cards + charts
- [ ] Claims table filters and paginates correctly
- [ ] Denial analysis shows outlier providers with visual flag
- [ ] AR aging displays correct bucket totals
- [ ] Appeals can be generated, status updated, and text copied
- [ ] Import flow works for all 4 import types
- [ ] Sidebar shows section for authorized roles only
- [ ] ANALYST sees read-only views (no create/edit/import buttons)

## Risk Assessment
- **Page size:** Each page should stay under 200 lines; extract reusable components or split tab content into sub-components if needed
- **Chart library:** Recharts already in project; use BarChart, LineChart, PieChart components consistently
- **Loading states:** Use TanStack Query's `isLoading` / `isError` states; show skeleton loaders matching existing patterns
