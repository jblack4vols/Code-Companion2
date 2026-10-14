# Phase 01: Authorization Expiration Alert (QW-6)

## Context

- [EBITDA Analysis](../reports/ebitda-improvement-analysis.md) — QW-6
- [Schema](../../shared/schema.ts) — `referrals` table
- [Storage](../../server/storage-referrals.ts) — referral queries
- [Routes](../../server/routes/referrals.ts) — referral API

## Overview

- **Priority:** P1 — schema change should land first
- **Status:** pending
- **Effort:** 1 day
- **Impact:** Captures revenue from expiring authorizations before visits lapse

Add `authorizedVisits` and `authExpirationDate` columns to `referrals` table. Build a query for referrals with expiring/expired authorizations. Display as a call list with auth utilization KPI.

## Key Insights

- `referrals` already has `scheduledVisits`, `arrivedVisits` — `authorizedVisits` complements these
- Auth utilization = `arrivedVisits / authorizedVisits` (how much of the auth is used)
- "Expiring soon" = `authExpirationDate` within next 14 days AND `arrivedVisits < authorizedVisits`
- No new table needed — just 2 columns on existing `referrals`

## Schema Changes

**File: `shared/schema.ts`** — Add to `referrals` table definition (after `dateOfFirstArrivedVisit`):

```ts
authorizedVisits: integer("authorized_visits"),
authExpirationDate: date("auth_expiration_date"),
```

No insert schema changes needed — these are optional fields, already included via `createInsertSchema`.

## Storage Methods

**File: `server/storage-referrals.ts`** — Add new exported function:

```ts
export interface AuthExpirationEntry {
  id: string;
  patientAccountNumber: string | null;
  patientFullName: string | null;
  patientPhone: string | null;
  locationId: string;
  locationName: string;
  physicianName: string | null;
  referralDate: string;
  authorizedVisits: number;
  arrivedVisits: number;
  authExpirationDate: string;
  daysUntilExpiration: number;
  utilizationPct: number;
  remainingVisits: number;
  urgency: "EXPIRED" | "CRITICAL" | "WARNING" | "OK";
}

export async function getExpiringAuthorizations(filters?: {
  locationId?: string;
  locationIds?: string[] | null;
  daysAhead?: number;
}): Promise<AuthExpirationEntry[]>
```

Query logic:
- Filter: `authExpirationDate IS NOT NULL` AND `arrivedVisits < authorizedVisits` AND `status IN ('RECEIVED','SCHEDULED','EVAL_COMPLETED')` AND `deletedAt IS NULL`
- Urgency: EXPIRED (past date), CRITICAL (0-3 days), WARNING (4-14 days), OK (15+ days)
- Default `daysAhead = 30`
- Join `locations` for name, join `physicians` for name
- Apply location scoping via `locationIds` filter
- Order by `authExpirationDate ASC` (most urgent first)

**File: `server/storage.ts`** — Add to IStorage interface:

```ts
getExpiringAuthorizations(filters?: {
  locationId?: string;
  locationIds?: string[] | null;
  daysAhead?: number;
}): Promise<referralsStorage.AuthExpirationEntry[]>;
```

Add to DatabaseStorage class:

```ts
getExpiringAuthorizations = referralsStorage.getExpiringAuthorizations;
```

Re-export type:

```ts
export type { AuthExpirationEntry } from "./storage-referrals";
```

## API Endpoint

**File: `server/routes/referrals.ts`** — Add endpoint:

```ts
// GET /api/referrals/expiring-authorizations
// Roles: all authenticated (location-scoped)
app.get("/api/referrals/expiring-authorizations", requireAuth, async (req, res) => {
  const locationIds = await getUserLocationScope(req);
  const daysAhead = parseInt(qstr(req.query.daysAhead) || "30");
  const locationId = qstr(req.query.locationId);
  const data = await storage.getExpiringAuthorizations({
    locationId,
    locationIds,
    daysAhead,
  });
  res.json(data);
});
```

## Frontend

**New file: `client/src/pages/auth-expiration-alerts.tsx`** (~180 lines)

Components:
- KPI cards at top: Total Expiring (30d), Avg Auth Utilization %, Visits at Risk (sum of remaining)
- Filter: location dropdown, days-ahead slider (7/14/30/60)
- Table with columns: Patient, Location, Physician, Auth Visits, Used, Remaining, Expiration, Urgency badge
- Urgency badge colors: EXPIRED=red, CRITICAL=orange, WARNING=yellow, OK=green
- Row click could link to referral detail (future)

Data fetching pattern (matches existing pages):
```ts
const { data, isLoading } = useQuery({
  queryKey: ["/api/referrals/expiring-authorizations", locationId, daysAhead],
  queryFn: () => apiRequest(`/api/referrals/expiring-authorizations?locationId=${locationId}&daysAhead=${daysAhead}`).then(r => r.json()),
});
```

## Routing & Navigation

**File: `client/src/App.tsx`**:
- Add lazy import: `const AuthExpirationAlertsPage = lazy(() => import("@/pages/auth-expiration-alerts"));`
- Add route under Finance section: `<Route path="/auth-alerts" component={guard(ANALYTICS, AuthExpirationAlertsPage)} />`

**File: `client/src/components/app-sidebar.tsx`**:
- Add to `financeItems` array: `{ title: "Auth Alerts", url: "/auth-alerts", icon: AlertTriangle }`

## Implementation Steps

- [ ] Add `authorizedVisits` and `authExpirationDate` columns to `referrals` in `shared/schema.ts`
- [ ] Run `npm run db:push` to apply schema
- [ ] Add `getExpiringAuthorizations` function to `server/storage-referrals.ts`
- [ ] Add method to `IStorage` interface and `DatabaseStorage` class in `server/storage.ts`
- [ ] Add GET endpoint in `server/routes/referrals.ts`
- [ ] Create `client/src/pages/auth-expiration-alerts.tsx`
- [ ] Add route in `client/src/App.tsx`
- [ ] Add sidebar nav item in `client/src/components/app-sidebar.tsx`
- [ ] Run `npm run check` for type checking
- [ ] Test endpoint manually and verify UI renders

## Success Criteria

- New columns accept data via referral import or manual edit
- `/api/referrals/expiring-authorizations` returns correct urgency classification
- Page shows expiring auths sorted by urgency
- Location scoping enforced for non-admin roles
- Auth utilization KPI calculates correctly

## Risk Assessment

- **Low risk**: additive schema change, nullable columns, no breaking changes
- Existing referral imports may not have auth data yet — page shows empty until data populated
- CSV import (`server/routes/import.ts`) may need column mapping update for bulk auth data import

## Security

- `requireAuth` middleware on endpoint
- Location scoping via `getUserLocationScope()` — non-admin users only see their locations
- Patient names visible — ensure only authenticated users with location access see data
