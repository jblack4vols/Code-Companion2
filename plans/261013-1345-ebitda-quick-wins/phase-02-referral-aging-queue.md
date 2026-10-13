# Phase 02: Unscheduled Referral Aging Queue (QW-1)

## Context

- [EBITDA Analysis](../reports/ebitda-improvement-analysis.md) — QW-5 (renumbered to Phase 02)
- [Schema](../../shared/schema.ts) — `referrals` table (lines 154-194)
- [Storage](../../server/storage-referrals.ts) — referral queries
- [Routes](../../server/routes/referrals.ts) — referral API

## Overview

- **Priority:** P1 — prevents referral leakage at intake
- **Status:** pending
- **Effort:** 0.5 day
- **Impact:** Each lost referral = ~$1,200 avg revenue; catching 2/month = $28K/year

Referrals stuck in `RECEIVED` status with no `dateOfFirstScheduledVisit` are leaking revenue. Build a queue showing these referrals color-coded by age to drive front desk action.

## Key Insights

- No schema changes — all columns exist: `status`, `dateOfFirstScheduledVisit`, `referralDate`, `createdAt`
- Filter: `status = 'RECEIVED'` AND `dateOfFirstScheduledVisit IS NULL` AND `deletedAt IS NULL`
- Age calculated from `referralDate` (or `createdAt` if referralDate is future-dated)
- Color bands: GREEN (<24h), YELLOW (24-48h), ORANGE (48-72h), RED (72h+)
- Natural home: new standalone page accessible by all roles (front desk especially)

## Schema Changes

None required.

## Storage Methods

**File: `server/storage-referrals.ts`** — Add new exported function:

```ts
export interface UnscheduledReferralEntry {
  id: string;
  patientAccountNumber: string | null;
  patientFullName: string | null;
  patientPhone: string | null;
  referringProviderName: string | null;
  physicianName: string | null;
  locationId: string;
  locationName: string;
  referralDate: string;
  ageHours: number;
  urgency: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  primaryInsurance: string | null;
  discipline: string | null;
  caseTitle: string | null;
}

export async function getUnscheduledReferrals(filters?: {
  locationId?: string;
  locationIds?: string[] | null;
  minAgeHours?: number;
}): Promise<UnscheduledReferralEntry[]>
```

Query logic:
- `WHERE status = 'RECEIVED' AND date_of_first_scheduled_visit IS NULL AND deleted_at IS NULL`
- Default `minAgeHours = 0` (show all unscheduled)
- Calculate `ageHours = EXTRACT(EPOCH FROM (NOW() - referral_date::timestamp)) / 3600`
- Urgency: GREEN (<24h), YELLOW (24-48h), ORANGE (48-72h), RED (72h+)
- Join `locations` for name, LEFT JOIN `physicians` for name
- Apply location scoping
- Order by `referralDate ASC` (oldest first = most urgent)

**File: `server/storage.ts`** — Add to IStorage interface:

```ts
getUnscheduledReferrals(filters?: {
  locationId?: string;
  locationIds?: string[] | null;
  minAgeHours?: number;
}): Promise<referralsStorage.UnscheduledReferralEntry[]>;
```

Add to DatabaseStorage:

```ts
getUnscheduledReferrals = referralsStorage.getUnscheduledReferrals;
```

Re-export type:

```ts
export type { UnscheduledReferralEntry } from "./storage-referrals";
```

## API Endpoint

**File: `server/routes/referrals.ts`** — Add endpoint:

```ts
// GET /api/referrals/unscheduled-aging
// Roles: all authenticated (location-scoped)
app.get("/api/referrals/unscheduled-aging", requireAuth, async (req, res) => {
  const locationIds = await getUserLocationScope(req);
  const locationId = qstr(req.query.locationId);
  const minAgeHours = parseInt(qstr(req.query.minAgeHours) || "0");
  const data = await storage.getUnscheduledReferrals({
    locationId,
    locationIds,
    minAgeHours,
  });
  res.json(data);
});
```

## Frontend

**New file: `client/src/pages/referral-aging-queue.tsx`** (~170 lines)

Components:
- Summary cards: Total Unscheduled, RED count, avg age (hours), oldest referral age
- Filter bar: location dropdown, min-age filter (All / 24h+ / 48h+ / 72h+)
- Table columns: Patient, Phone, Provider, Location, Insurance, Discipline, Age, Urgency
- Urgency column: colored Badge (`destructive` for RED, custom for ORANGE/YELLOW, `secondary` for GREEN)
- Age column: display as "Xh" or "Xd Yh" for readability
- Click row to navigate to referral detail or trigger scheduling action (future)

Data fetching:
```ts
const { data, isLoading } = useQuery({
  queryKey: ["/api/referrals/unscheduled-aging", locationId, minAgeHours],
  queryFn: () => apiRequest(
    `/api/referrals/unscheduled-aging?locationId=${locationId || ""}&minAgeHours=${minAgeHours}`
  ).then(r => r.json()),
  refetchInterval: 60_000, // auto-refresh every 60s — this is a real-time queue
});
```

## Routing & Navigation

**File: `client/src/App.tsx`**:
- Add lazy import: `const ReferralAgingQueuePage = lazy(() => import("@/pages/referral-aging-queue"));`
- Add route (open to all authenticated): `<Route path="/referral-aging" component={ReferralAgingQueuePage} />`

**File: `client/src/components/app-sidebar.tsx`**:
- Add to `coreItems` array (high visibility): `{ title: "Aging Queue", url: "/referral-aging", icon: Clock }`
- `Clock` icon is already imported in sidebar

## Implementation Steps

- [ ] Add `getUnscheduledReferrals` function to `server/storage-referrals.ts`
- [ ] Add method to `IStorage` interface and `DatabaseStorage` class in `server/storage.ts`
- [ ] Add GET endpoint in `server/routes/referrals.ts`
- [ ] Create `client/src/pages/referral-aging-queue.tsx`
- [ ] Add route in `client/src/App.tsx`
- [ ] Add sidebar nav item in `client/src/components/app-sidebar.tsx`
- [ ] Run `npm run check` for type checking
- [ ] Verify with existing referral data

## Success Criteria

- Page shows all `RECEIVED` referrals with no scheduled visit
- Color-coding matches urgency bands (GREEN/YELLOW/ORANGE/RED)
- Auto-refreshes every 60 seconds
- Location scoping works for non-admin roles
- Empty state when no unscheduled referrals exist

## Risk Assessment

- **Very low risk**: read-only query on existing data, no schema changes
- If `referralDate` is stored as `date` (not `timestamp`), age calculation uses start of day — acceptable approximation
- High referral volumes (unlikely for 8 locations) could be handled with pagination if needed

## Security

- `requireAuth` on endpoint
- Location scoping via `getUserLocationScope()`
- Patient names/phone visible — appropriate for staff with location access
