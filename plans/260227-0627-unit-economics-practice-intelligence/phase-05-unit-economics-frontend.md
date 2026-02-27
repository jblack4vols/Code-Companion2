# Phase 5: Unit Economics Frontend

## Context Links
- Backend endpoints: `phase-03-unit-economics-backend.md`
- Dashboard page pattern: `client/src/pages/executive-dashboard.tsx`
- Location dashboard pattern: `client/src/pages/location-dashboard.tsx`
- Import page pattern: `client/src/pages/import.tsx`
- Auth context: `client/src/lib/auth.ts` (useAuth hook for role checks)
- UI primitives: `client/src/components/ui/` (Card, Table, Badge, Button, Select, Dialog, Tabs)

## Overview
- **Priority:** P2
- **Status:** pending
- **Description:** 6 frontend pages for the unit economics subsystem: dashboard heat map, location detail, provider productivity, alert management, targets configuration, data import.

## Key Insights
- Recharts is available for line/bar/composed charts. Use `ResponsiveContainer` wrapper.
- Color coding: use CSS variables `--chart-4` (green), `--chart-3` (yellow), `--chart-5` (red) for RAG status.
- Auth hook: `const { user } = useAuth()` provides current user with `user.role`.
- Client-side role gate: hide nav items for unauthorized roles. Server enforces real access control.
- `apiRequest(method, url, body)` for mutations (handles CSRF token).
- `queryClient.invalidateQueries({ queryKey: [...] })` after mutations.

## Architecture

```
/unit-economics                     Main dashboard (heat map)
/unit-economics/location/:id        Location financial detail
/unit-economics/providers           Provider productivity leaderboard
/unit-economics/alerts              Alert management
/unit-economics/targets             Targets configuration
/unit-economics/import              Financial data import (CSV)
```

## Related Code Files

### Files to Create
- `client/src/pages/unit-economics-dashboard.tsx`
- `client/src/pages/unit-economics-location-detail.tsx`
- `client/src/pages/unit-economics-provider-productivity.tsx`
- `client/src/pages/unit-economics-alerts.tsx`
- `client/src/pages/unit-economics-targets.tsx`
- `client/src/pages/unit-economics-data-import.tsx`

### Files to Modify
- `client/src/App.tsx` -- add 6 Route entries
- `client/src/components/app-sidebar.tsx` -- add "Unit Economics" nav group

## Implementation Steps

### Step 1: Unit Economics Dashboard (Heat Map)

File: `client/src/pages/unit-economics-dashboard.tsx`

**Data source:** `GET /api/unit-economics/dashboard` returns `UnitEconomicsLocationSummary[]`

**Layout:**
```
+------------------------------------------------------------------+
| Unit Economics Dashboard                        [Refresh button]  |
+------------------------------------------------------------------+
| Summary Cards (4):                                                |
| [Total Revenue] [Avg Rev/Visit] [Avg Cost/Visit] [Active Alerts] |
+------------------------------------------------------------------+
| Location Heat Map Grid (8 locations x 6 metrics)                  |
| +----------+--------+--------+--------+--------+--------+------+ |
| | Location | Rev/Vs | Cost/V | Labor% | Margin | Alerts | Net  | |
| +----------+--------+--------+--------+--------+--------+------+ |
| | Clinic A | $105 G | $78 G  | 48% G  | 22% G  |  0     | $42K | |
| | Clinic B | $89 Y  | $91 R  | 58% R  |  5% R  |  3     | $5K  | |
| | ...                                                            | |
| +----------+--------+--------+--------+--------+--------+------+ |
+------------------------------------------------------------------+
| 30-Day Forecast (if data available)                               |
| [Location bars with up/down arrows]                               |
+------------------------------------------------------------------+
```

**Color coding function:**
```tsx
function metricColor(metric: string, value: number): string {
  const rules: Record<string, { green: number; yellow: number }> = {
    revenuePerVisit: { green: 95, yellow: 80 },   // > green = green, > yellow = yellow, else red
    costPerVisit:    { green: 80, yellow: 92 },    // INVERTED: < green = green, < yellow = yellow
    laborPercent:    { green: 50, yellow: 57.5 },   // INVERTED
    netMargin:       { green: 15, yellow: 5 },
  };
  const rule = rules[metric];
  if (!rule) return "";
  // For inverted metrics (lower is better):
  if (metric === "costPerVisit" || metric === "laborPercent") {
    if (value <= rule.green) return "bg-chart-4/15 text-chart-4";
    if (value <= rule.yellow) return "bg-chart-3/15 text-chart-3";
    return "bg-chart-5/15 text-chart-5";
  }
  // Normal metrics (higher is better):
  if (value >= rule.green) return "bg-chart-4/15 text-chart-4";
  if (value >= rule.yellow) return "bg-chart-3/15 text-chart-3";
  return "bg-chart-5/15 text-chart-5";
}
```

**Click handler:** Clicking a location row navigates to `/unit-economics/location/:id`.

### Step 2: Location Financial Detail

File: `client/src/pages/unit-economics-location-detail.tsx`

**Data source:** `GET /api/unit-economics/location/:id`

**Layout:**
```
+------------------------------------------------------------------+
| [<- Back] Clinic Name Financial Detail                            |
+------------------------------------------------------------------+
| KPI Cards: Rev/Visit | Cost/Visit | Labor% | Net Margin | Net $  |
+------------------------------------------------------------------+
| Tabs: [Trends] [Providers] [Alerts]                              |
|                                                                   |
| [Trends tab]:                                                     |
|   Line chart: Revenue/visit and Cost/visit over time              |
|   Line chart: Labor % over time                                   |
|   Bar chart: Net contribution over time                           |
|                                                                   |
| [Providers tab]:                                                  |
|   Table: provider name, visits, units, units/hr, revenue, target  |
|                                                                   |
| [Alerts tab]:                                                     |
|   List of active alerts for this location                         |
+------------------------------------------------------------------+
```

**Charts:** Use `ComposedChart` from Recharts for dual-axis (revenue line + cost line). Bar chart for net contribution.

### Step 3: Provider Productivity Page

File: `client/src/pages/unit-economics-provider-productivity.tsx`

**Data source:** `GET /api/unit-economics/providers`

**Layout:**
```
+------------------------------------------------------------------+
| Provider Productivity                    [Date range selector]    |
+------------------------------------------------------------------+
| Top 3 Performers (cards with green border)                        |
| Bottom 3 Performers (cards with red border)                       |
+------------------------------------------------------------------+
| Full Leaderboard Table:                                           |
| Provider | Location | Visits | Units | Units/Hr | Revenue | Tgt% |
+------------------------------------------------------------------+
```

**Target attainment color:** >= 100% green, 80-99% yellow, < 80% red.

### Step 4: Alert Management Page

File: `client/src/pages/unit-economics-alerts.tsx`

**Data source:** `GET /api/unit-economics/alerts`, `POST /api/unit-economics/alerts/:id/acknowledge`

**Layout:**
```
+------------------------------------------------------------------+
| Financial Alerts                    [Show acknowledged toggle]    |
+------------------------------------------------------------------+
| Active Alerts (sorted by triggeredAt DESC)                        |
| +--------------------------------------------------------------+ |
| | [!] Clinic B: Revenue/visit $89 below $95 threshold           | |
| |     Triggered: Feb 25, 2026   [Acknowledge button]            | |
| +--------------------------------------------------------------+ |
| | [!] Clinic B: Labor 58% exceeds 57.5% threshold              | |
| |     Triggered: Feb 25, 2026   [Acknowledge button]            | |
| +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

**Acknowledge mutation:**
```tsx
const acknowledgeMutation = useMutation({
  mutationFn: async (alertId: string) => {
    await apiRequest("POST", `/api/unit-economics/alerts/${alertId}/acknowledge`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/unit-economics/alerts"] });
  },
});
```

**Alert type icons:** Map each `financialAlertTypeEnum` to a Lucide icon + color.

### Step 5: Targets Configuration Page

File: `client/src/pages/unit-economics-targets.tsx`

**Data source:** `GET /api/unit-economics/targets`, `PATCH /api/unit-economics/targets`

**Layout:**
```
+------------------------------------------------------------------+
| Financial Targets                                    [Save btn]   |
+------------------------------------------------------------------+
| Global Defaults                                                   |
| +--------------------------------------------------------------+ |
| | Metric          | Target | Warning | Critical                | |
| | Revenue/Visit   | $105   | $95     | $85                     | |
| | Cost/Visit      | $80    | $88     | $92                     | |
| | Labor %         | 48%    | 55%     | 60%                     | |
| | Provider Rev/Wk | $7,500 | $6,000  | $5,700                  | |
| +--------------------------------------------------------------+ |
|                                                                   |
| Per-Location Overrides (Tabs or Select for each location)         |
| [Clinic A] [Clinic B] ...                                         |
| Same table as above, blank = use global default                   |
+------------------------------------------------------------------+
```

**Form pattern:** Use `useState` for editable fields. On Save, collect all changed targets into array and `PATCH /api/unit-economics/targets` with `{ targets: [...] }`.

**Role guard:** Only OWNER can save. DIRECTOR can view.

### Step 6: Data Import Page (deferred to Phase 6)

File: `client/src/pages/unit-economics-data-import.tsx` -- see `phase-06-data-import-pipeline.md`.

### Step 7: Register Routes and Navigation

**App.tsx additions:**
```tsx
import UnitEconomicsDashboardPage from "@/pages/unit-economics-dashboard";
import UnitEconomicsLocationDetailPage from "@/pages/unit-economics-location-detail";
import UnitEconomicsProviderProductivityPage from "@/pages/unit-economics-provider-productivity";
import UnitEconomicsAlertsPage from "@/pages/unit-economics-alerts";
import UnitEconomicsTargetsPage from "@/pages/unit-economics-targets";
import UnitEconomicsDataImportPage from "@/pages/unit-economics-data-import";

// Routes:
<Route path="/unit-economics" component={UnitEconomicsDashboardPage} />
<Route path="/unit-economics/location/:id">
  {(params) => <UnitEconomicsLocationDetailPage params={params} />}
</Route>
<Route path="/unit-economics/providers" component={UnitEconomicsProviderProductivityPage} />
<Route path="/unit-economics/alerts" component={UnitEconomicsAlertsPage} />
<Route path="/unit-economics/targets" component={UnitEconomicsTargetsPage} />
<Route path="/unit-economics/import" component={UnitEconomicsDataImportPage} />
```

**Sidebar additions** (in a new "Finance" group, visible to OWNER/DIRECTOR/ANALYST only):
```tsx
{
  title: "Finance",
  items: [
    { title: "Unit Economics", url: "/unit-economics", icon: DollarSign },
    { title: "Provider Productivity", url: "/unit-economics/providers", icon: Activity },
    { title: "Financial Alerts", url: "/unit-economics/alerts", icon: AlertTriangle },
    { title: "Targets", url: "/unit-economics/targets", icon: Target },
    { title: "Import Financials", url: "/unit-economics/import", icon: Upload },
  ],
}
```

Client-side role filter: check `user.role` in sidebar render, hide "Finance" group for MARKETER/FRONT_DESK.

## Todo List

- [ ] Create `unit-economics-dashboard.tsx` with heat map grid
- [ ] Create `unit-economics-location-detail.tsx` with trend charts + tabs
- [ ] Create `unit-economics-provider-productivity.tsx` with leaderboard
- [ ] Create `unit-economics-alerts.tsx` with acknowledge functionality
- [ ] Create `unit-economics-targets.tsx` with editable form
- [ ] Create `unit-economics-data-import.tsx` (Phase 6 content)
- [ ] Add all 6 routes to `App.tsx`
- [ ] Add Finance nav group to sidebar
- [ ] Add role-based visibility to sidebar nav items
- [ ] Test all pages render without errors
- [ ] Test acknowledge mutation
- [ ] Test targets save mutation
- [ ] Verify color coding logic

## Success Criteria

- Dashboard heat map renders 8 locations with 6 metric columns, color-coded
- Clicking location navigates to detail page with trend charts
- Provider leaderboard shows top/bottom performers with target attainment
- Alert page lists unacknowledged alerts; acknowledge button works
- Targets page allows editing and saving thresholds
- Sidebar shows Finance group only for OWNER/DIRECTOR/ANALYST
- All pages show loading skeletons during fetch
- All pages handle empty state (no data yet)

## Risk Assessment

- **No financial data initially:** All pages must handle empty state gracefully. Show "No financial data yet. Import data to get started." with link to import page.
- **Heat map readability:** 8 rows x 6 cols is manageable. If more locations added later, consider horizontal scroll or condensed view.
- **Chart performance:** Trend data limited to last 90 days by default; shouldn't cause rendering issues.

## Security Considerations

- Client-side role checks are for UX only; server enforces real authorization
- No mutations on read-only pages (dashboard, providers)
- Acknowledge and targets mutations require CSRF token (handled by `apiRequest`)
- Financial data is sensitive; pages hidden from non-authorized roles
