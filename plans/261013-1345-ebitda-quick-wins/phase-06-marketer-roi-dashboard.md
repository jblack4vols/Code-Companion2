# Phase 06: Marketer ROI Dashboard (QW-5)

## Context

- [EBITDA Analysis](../reports/ebitda-improvement-analysis.md) — QW-2
- [Schema](../../shared/schema.ts) — `users` (line 63), `physicians` (line 99), `physicianMonthlySummary` (line 295), `territories` (line 273)
- [Storage](../../server/storage-users.ts) — `getMarketers`
- [Dashboard](../../client/src/pages/team-leaderboard.tsx) — existing leaderboard (interactions/tasks, not revenue ROI)

## Overview

- **Priority:** P2 — identifies under/over-performing marketer territories
- **Status:** pending
- **Effort:** 2 days
- **Impact:** Justifies marketer headcount, reveals territory imbalances, informs hiring/territory rebalancing

Join `users` (MARKETER role) -> `physicians` (assignedOwnerId) -> `physicianMonthlySummary` (revenueGenerated) to show revenue attribution per marketer. Add compensation fields to calculate ROI ratio.

## Key Insights

- `physicians.assignedOwnerId` links a physician to a marketer (user)
- `physicianMonthlySummary.revenueGenerated` tracks revenue per physician per month
- Chain: marketer -> assigned physicians -> their monthly revenue = marketer's attributed revenue
- `territories.repUserId` also links territory to marketer — can aggregate by territory
- `users` table lacks compensation fields — need to add `annualSalary` and `commission` columns
- Existing `getMarketers()` in `storage-users.ts` returns users with MARKETER role
- Existing team leaderboard tracks interactions/tasks but NOT revenue ROI

## Schema Changes

**File: `shared/schema.ts`** — Add compensation fields to `users` table (after `forcePasswordChange`):

```ts
annualSalary: numeric("annual_salary", { precision: 10, scale: 2 }),
monthlyTarget: numeric("monthly_target", { precision: 10, scale: 2 }),
```

These are nullable — only populated for MARKETERs. No impact on existing auth/user flows since `createInsertSchema` already omits these (they're not in the omit list but are optional by default since nullable).

Verify `insertUserSchema` omit list — add the new fields if needed:
```ts
export const insertUserSchema = createInsertSchema(users).omit({
  id: true, createdAt: true, updatedAt: true, failedLoginAttempts: true,
  lockedUntil: true, lastLoginAt: true, passwordChangedAt: true,
  forcePasswordChange: true, approvalStatus: true,
  passwordResetToken: true, passwordResetExpires: true,
  // annualSalary and monthlyTarget are NOT omitted — settable on create/update
});
```

## Storage Methods

**New file: `server/storage-marketer-roi.ts`** (~150 lines)

```ts
export interface MarketerROIEntry {
  userId: string;
  userName: string;
  role: string;
  territoryName: string | null;
  assignedPhysicianCount: number;
  activePhysicianCount: number;       // physicians with referrals in period
  totalReferrals: number;             // from physicianMonthlySummary.referralsCount
  totalRevenue: number;               // from physicianMonthlySummary.revenueGenerated
  totalVisits: number;                // from physicianMonthlySummary.totalVisitsGenerated
  revenuePerPhysician: number;
  revenuePerReferral: number;
  annualSalary: number | null;
  monthlyCompensation: number | null;  // annualSalary / 12
  monthlyTarget: number | null;
  roiRatio: number | null;            // totalRevenue / monthlyCompensation (when comp exists)
  targetAttainmentPct: number | null;  // totalRevenue / monthlyTarget * 100
}

export interface MarketerROISummary {
  totalMarketers: number;
  totalAttributedRevenue: number;
  totalCompensation: number;
  overallROI: number;                 // totalRevenue / totalCompensation
  avgRevenuePerMarketer: number;
}

export async function getMarketerROI(filters?: {
  month?: string;       // specific month (YYYY-MM-DD)
  months?: number;      // trailing N months (default 1)
  territoryId?: string;
}): Promise<{
  marketers: MarketerROIEntry[];
  summary: MarketerROISummary;
}>
```

Query logic:
```sql
SELECT
  u.id AS user_id,
  u.name AS user_name,
  u.role,
  u.annual_salary,
  u.monthly_target,
  t.name AS territory_name,
  COUNT(DISTINCT p.id)::int AS assigned_physician_count,
  COUNT(DISTINCT CASE WHEN pms.referrals_count > 0 THEN p.id END)::int AS active_physician_count,
  COALESCE(SUM(pms.referrals_count), 0)::int AS total_referrals,
  COALESCE(SUM(pms.revenue_generated::numeric), 0) AS total_revenue,
  COALESCE(SUM(pms.total_visits_generated), 0)::int AS total_visits
FROM users u
LEFT JOIN physicians p ON p.assigned_owner_id = u.id AND p.deleted_at IS NULL
LEFT JOIN physician_monthly_summary pms ON pms.physician_id = p.id
  AND pms.month >= $dateFrom AND pms.month <= $dateTo
LEFT JOIN territories t ON t.rep_user_id = u.id
WHERE u.role = 'MARKETER'
GROUP BY u.id, u.name, u.role, u.annual_salary, u.monthly_target, t.name
ORDER BY SUM(pms.revenue_generated::numeric) DESC NULLS LAST
```

Derived fields (JS):
- `monthlyCompensation = annualSalary / 12`
- `roiRatio = totalRevenue / monthlyCompensation` (null when no salary)
- `targetAttainmentPct = totalRevenue / monthlyTarget * 100` (null when no target)
- `revenuePerPhysician = totalRevenue / assignedPhysicianCount`
- `revenuePerReferral = totalRevenue / totalReferrals`

**File: `server/storage.ts`** — Add to IStorage interface:

```ts
getMarketerROI(filters?: {
  month?: string; months?: number; territoryId?: string;
}): Promise<{
  marketers: marketerRoiStorage.MarketerROIEntry[];
  summary: marketerRoiStorage.MarketerROISummary;
}>;
```

Add import: `import * as marketerRoiStorage from "./storage-marketer-roi";`

Add to DatabaseStorage:
```ts
getMarketerROI = marketerRoiStorage.getMarketerROI;
```

Re-export types:
```ts
export type { MarketerROIEntry, MarketerROISummary } from "./storage-marketer-roi";
```

## API Endpoints

**New file: `server/routes/marketer-roi.ts`** (~50 lines)

```ts
export function registerMarketerROIRoutes(app: Express) {
  const READ = requireRole("OWNER", "DIRECTOR", "ANALYST");
  const WRITE = requireRole("OWNER", "DIRECTOR");

  // GET /api/marketer-roi — ROI dashboard data
  app.get("/api/marketer-roi", READ, async (req, res) => {
    const month = qstr(req.query.month);
    const months = parseInt(qstr(req.query.months) || "1");
    const territoryId = qstr(req.query.territoryId);
    const data = await storage.getMarketerROI({ month, months, territoryId });
    res.json(data);
  });

  // PATCH /api/users/:id/compensation — update salary/target
  // (uses existing updateUser, but exposed as a dedicated endpoint)
  app.patch("/api/users/:id/compensation", WRITE, async (req, res) => {
    const { annualSalary, monthlyTarget } = req.body;
    const updated = await storage.updateUser(req.params.id, {
      annualSalary, monthlyTarget,
    });
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(updated);
  });
}
```

**File: `server/routes.ts`** — Register new route module:
```ts
import { registerMarketerROIRoutes } from "./routes/marketer-roi";
// Add after registerRevenueRecoveryRoutes:
registerMarketerROIRoutes(app);
```

## Frontend

**New file: `client/src/pages/marketer-roi-dashboard.tsx`** (~190 lines)

Components:
- Summary cards: Total Marketers, Total Attributed Revenue, Total Compensation, Overall ROI Ratio
- Filter bar: month picker (default current month), trailing months (1/3/6/12), territory
- Table columns:
  - Marketer Name
  - Territory
  - Physicians (assigned / active)
  - Referrals
  - Revenue ($)
  - Compensation ($)
  - ROI Ratio (revenue / compensation)
  - Target Attainment %
- Color coding:
  - ROI >= 5x: green, 3-5x: yellow, < 3x: red
  - Target >= 100%: green, 75-100%: yellow, < 75%: red
- Inline edit for salary/target via PATCH endpoint (OWNER/DIRECTOR only)
- Sort by any column

Data fetching:
```ts
const { data, isLoading } = useQuery({
  queryKey: ["/api/marketer-roi", month, months, territoryId],
  queryFn: () => apiRequest(
    `/api/marketer-roi?months=${months}&month=${month || ""}&territoryId=${territoryId || ""}`
  ).then(r => r.json()),
});
```

## Routing & Navigation

**File: `client/src/App.tsx`**:
- Lazy import: `const MarketerROIDashboardPage = lazy(() => import("@/pages/marketer-roi-dashboard"));`
- Route: `<Route path="/marketer-roi" component={guard(ANALYTICS, MarketerROIDashboardPage)} />`

**File: `client/src/components/app-sidebar.tsx`**:
- Add to `analyticsItems` (after "Leaderboard"): `{ title: "Marketer ROI", url: "/marketer-roi", icon: LineChart, roles: ["OWNER", "DIRECTOR", "ANALYST"] as string[] }`

## Implementation Steps

- [ ] Add `annualSalary` and `monthlyTarget` columns to `users` in `shared/schema.ts`
- [ ] Run `npm run db:push` to apply schema
- [ ] Create `server/storage-marketer-roi.ts` with `getMarketerROI` function
- [ ] Add method to `IStorage` and `DatabaseStorage` in `server/storage.ts`
- [ ] Create `server/routes/marketer-roi.ts` with GET and PATCH endpoints
- [ ] Register routes in `server/routes.ts`
- [ ] Create `client/src/pages/marketer-roi-dashboard.tsx`
- [ ] Add route in `client/src/App.tsx`
- [ ] Add sidebar nav item in `client/src/components/app-sidebar.tsx`
- [ ] Run `npm run check`
- [ ] Seed compensation data for test marketers
- [ ] Verify ROI calculations

## Success Criteria

- Each marketer shows attributed revenue from their assigned physicians
- ROI ratio calculates correctly when compensation is set
- Target attainment shows progress against monthly target
- Compensation fields editable by OWNER/DIRECTOR
- Month picker correctly aggregates physicianMonthlySummary data

## Risk Assessment

- **Low risk**: additive schema change, nullable columns
- `annualSalary`/`monthlyTarget` fields on `users` need to be excluded from public API responses — verify `getUsers()` doesn't leak
- If no `physicianMonthlySummary` data exists for a period, marketer shows $0 revenue — expected behavior
- Marketer with no assigned physicians shows 0 across all metrics — show in table with "no assignments" state
- `updateUser` already accepts `Partial<InsertUser>` — adding salary fields is type-safe

## Security

- `requireRole("OWNER", "DIRECTOR", "ANALYST")` for read
- `requireRole("OWNER", "DIRECTOR")` for compensation updates
- Salary data visible only to executive roles — no MARKETER self-view of compensation
- Audit log on compensation changes (existing `updateUser` audit trail)
