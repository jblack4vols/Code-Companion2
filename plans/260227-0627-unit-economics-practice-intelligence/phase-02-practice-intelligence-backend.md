# Phase 2: Practice Intelligence Backend

## Context Links
- Existing provider-offices endpoint: `server/routes/physicians.ts` lines 57-156
- Storage interface: `server/storage.ts` lines 78-229
- Dashboard route pattern: `server/routes/dashboard.ts`
- Referrals table: `shared/schema.ts` lines 139-179
- Physicians table: `shared/schema.ts` lines 84-118

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** Create `GET /api/practices` and `GET /api/practices/:name/detail` endpoints that aggregate physicians by `practiceName` with financial metrics (revenue, referral count, arrival rate, last interaction). Extends the existing provider-offices pattern with richer analytics.

## Key Insights
- Existing `/api/provider-offices` already groups by `practice_name` but only returns count + total referrals. Feature A needs revenue, arrival rate, last interaction.
- Revenue data lives in `physicianMonthlySummary.revenueGenerated`. Must join or subquery.
- Arrival rate is computed from `referrals.arrivedVisits / referrals.scheduledVisits`.
- Last interaction comes from `physicians.lastInteractionAt` (pre-computed) or `MAX(interactions.occurred_at)`.
- Decision: Create new `/api/practices` endpoints in a new route file rather than modifying the existing provider-offices endpoints (avoid breaking existing UI).

## Architecture

```
GET /api/practices
  -> Raw SQL: GROUP BY TRIM(practice_name)
  -> Joins: physicians LEFT JOIN referrals LEFT JOIN physician_monthly_summary
  -> Returns: PaginatedResult<PracticeSummary>

GET /api/practices/:name/detail
  -> Fetch physicians WHERE practice_name = :name
  -> For each: referral count, revenue, last interaction, arrival rate
  -> Returns: { practice: PracticeSummary, physicians: PhysicianWithMetrics[] }
```

## Related Code Files

### Files to Create
- `server/routes/practice-intelligence.ts` -- route handlers

### Files to Modify
- `server/storage.ts` -- add `IStorage` methods + `DatabaseStorage` implementations
- `server/routes.ts` -- register route module

## Implementation Steps

### Step 1: Add IStorage Methods

In `server/storage.ts`, add to the `IStorage` interface (before the closing `}`):

```typescript
// Practice Intelligence
getPractices(filters: {
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResult<PracticeSummary>>;

getPracticeDetail(practiceName: string): Promise<PracticeDetail | null>;
```

Add type definitions above `IStorage`:

```typescript
export interface PracticeSummary {
  practiceName: string;
  physicianCount: number;
  totalReferrals: number;
  totalRevenue: number;
  arrivalRate: number;
  lastInteractionAt: string | null;
  city: string | null;
  state: string | null;
}

export interface PracticeDetail {
  practice: PracticeSummary;
  physicians: Array<{
    id: string;
    firstName: string;
    lastName: string;
    credentials: string | null;
    specialty: string | null;
    status: string;
    relationshipStage: string;
    referralCount: number;
    revenueGenerated: number;
    arrivalRate: number;
    lastInteractionAt: string | null;
    interactionCount: number;
  }>;
}
```

### Step 2: Implement DatabaseStorage Methods

Add to `DatabaseStorage` class:

```typescript
async getPractices(filters: {
  search?: string; sortBy?: string; sortOrder?: string;
  page?: number; pageSize?: number;
}): Promise<PaginatedResult<PracticeSummary>> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const offset = (page - 1) * pageSize;
  const searchPattern = filters.search ? `%${filters.search}%` : null;

  const searchCond = searchPattern
    ? sql`AND (p.practice_name ILIKE ${searchPattern} OR p.city ILIKE ${searchPattern})`
    : sql``;

  // Sort mapping
  const sortMap: Record<string, string> = {
    practiceName: "practice_name",
    physicianCount: "physician_count",
    totalReferrals: "total_referrals",
    totalRevenue: "total_revenue",
    arrivalRate: "arrival_rate",
    lastInteractionAt: "last_interaction",
  };
  const sortCol = sortMap[filters.sortBy || "totalReferrals"] || "total_referrals";
  const sortDir = filters.sortOrder === "asc" ? "ASC" : "DESC";

  const countResult = await db.execute(sql`
    SELECT COUNT(DISTINCT TRIM(p.practice_name)) as total
    FROM physicians p
    WHERE p.deleted_at IS NULL
      AND p.practice_name IS NOT NULL
      AND TRIM(p.practice_name) != ''
      ${searchCond}
  `);
  const total = parseInt((countResult.rows[0] as any)?.total || "0");

  const dataResult = await db.execute(sql.raw(`
    SELECT
      TRIM(p.practice_name) as practice_name,
      COUNT(DISTINCT p.id)::int as physician_count,
      COALESCE(SUM(ref_agg.ref_count), 0)::int as total_referrals,
      COALESCE(SUM(rev_agg.total_rev), 0)::numeric as total_revenue,
      CASE
        WHEN COALESCE(SUM(ref_agg.scheduled), 0) > 0
        THEN ROUND(SUM(ref_agg.arrived)::numeric / SUM(ref_agg.scheduled)::numeric * 100, 1)
        ELSE 0
      END as arrival_rate,
      MAX(p.last_interaction_at) as last_interaction,
      MIN(p.city) as city,
      MIN(p.state) as state
    FROM physicians p
    LEFT JOIN (
      SELECT physician_id,
        COUNT(*) as ref_count,
        SUM(COALESCE(scheduled_visits, 0)) as scheduled,
        SUM(COALESCE(arrived_visits, 0)) as arrived
      FROM referrals WHERE deleted_at IS NULL
      GROUP BY physician_id
    ) ref_agg ON ref_agg.physician_id = p.id
    LEFT JOIN (
      SELECT physician_id, SUM(COALESCE(revenue_generated, 0)::numeric) as total_rev
      FROM physician_monthly_summary
      GROUP BY physician_id
    ) rev_agg ON rev_agg.physician_id = p.id
    WHERE p.deleted_at IS NULL
      AND p.practice_name IS NOT NULL
      AND TRIM(p.practice_name) != ''
      ${searchPattern ? `AND (p.practice_name ILIKE '${searchPattern}' OR p.city ILIKE '${searchPattern}')` : ''}
    GROUP BY TRIM(p.practice_name)
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ${pageSize} OFFSET ${offset}
  `));
  // NOTE: Use parameterized queries for search — raw SQL shown for sort column.
  // Actual implementation must use sql`` template for search params.

  const data: PracticeSummary[] = (dataResult.rows as any[]).map(r => ({
    practiceName: r.practice_name,
    physicianCount: r.physician_count,
    totalReferrals: r.total_referrals,
    totalRevenue: parseFloat(r.total_revenue || "0"),
    arrivalRate: parseFloat(r.arrival_rate || "0"),
    lastInteractionAt: r.last_interaction ? new Date(r.last_interaction).toISOString() : null,
    city: r.city,
    state: r.state,
  }));

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
```

**Important:** The actual implementation should use parameterized `sql` template literals for the search filter (not raw string interpolation). Use `sql.raw()` only for the ORDER BY column name. Follow the pattern in `server/routes/physicians.ts` lines 74-82 for dynamic sort with mapped SQL fragments.

```typescript
async getPracticeDetail(practiceName: string): Promise<PracticeDetail | null> {
  const trimmedName = practiceName.trim();
  if (!trimmedName) return null;

  // Get all physicians at this practice
  const physResult = await db.execute(sql`
    SELECT p.*,
      COALESCE(ref_agg.ref_count, 0)::int as referral_count,
      COALESCE(ref_agg.scheduled, 0)::int as total_scheduled,
      COALESCE(ref_agg.arrived, 0)::int as total_arrived,
      COALESCE(rev_agg.total_rev, 0)::numeric as revenue_generated,
      COALESCE(int_agg.int_count, 0)::int as interaction_count
    FROM physicians p
    LEFT JOIN (
      SELECT physician_id,
        COUNT(*) as ref_count,
        SUM(COALESCE(scheduled_visits, 0)) as scheduled,
        SUM(COALESCE(arrived_visits, 0)) as arrived
      FROM referrals WHERE deleted_at IS NULL
      GROUP BY physician_id
    ) ref_agg ON ref_agg.physician_id = p.id
    LEFT JOIN (
      SELECT physician_id, SUM(COALESCE(revenue_generated, 0)::numeric) as total_rev
      FROM physician_monthly_summary
      GROUP BY physician_id
    ) rev_agg ON rev_agg.physician_id = p.id
    LEFT JOIN (
      SELECT physician_id, COUNT(*) as int_count
      FROM interactions WHERE deleted_at IS NULL
      GROUP BY physician_id
    ) int_agg ON int_agg.physician_id = p.id
    WHERE p.deleted_at IS NULL
      AND TRIM(p.practice_name) = ${trimmedName}
    ORDER BY revenue_generated DESC
  `);

  if (physResult.rows.length === 0) return null;

  const physicians = (physResult.rows as any[]).map(r => {
    const scheduled = r.total_scheduled || 0;
    const arrived = r.total_arrived || 0;
    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      credentials: r.credentials,
      specialty: r.specialty,
      status: r.status,
      relationshipStage: r.relationship_stage,
      referralCount: r.referral_count,
      revenueGenerated: parseFloat(r.revenue_generated || "0"),
      arrivalRate: scheduled > 0 ? Math.round((arrived / scheduled) * 1000) / 10 : 0,
      lastInteractionAt: r.last_interaction_at ? new Date(r.last_interaction_at).toISOString() : null,
      interactionCount: r.interaction_count,
    };
  });

  const practice: PracticeSummary = {
    practiceName: trimmedName,
    physicianCount: physicians.length,
    totalReferrals: physicians.reduce((s, p) => s + p.referralCount, 0),
    totalRevenue: physicians.reduce((s, p) => s + p.revenueGenerated, 0),
    arrivalRate: (() => {
      const rows = physResult.rows as any[];
      const totalSched = rows.reduce((s, r) => s + (r.total_scheduled || 0), 0);
      const totalArr = rows.reduce((s, r) => s + (r.total_arrived || 0), 0);
      return totalSched > 0 ? Math.round((totalArr / totalSched) * 1000) / 10 : 0;
    })(),
    lastInteractionAt: physicians.reduce((latest: string | null, p) => {
      if (!p.lastInteractionAt) return latest;
      if (!latest) return p.lastInteractionAt;
      return p.lastInteractionAt > latest ? p.lastInteractionAt : latest;
    }, null),
    city: (physResult.rows[0] as any)?.city || null,
    state: (physResult.rows[0] as any)?.state || null,
  };

  return { practice, physicians };
}
```

### Step 3: Create Route File

Create `server/routes/practice-intelligence.ts`:

```typescript
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "./shared";

export function registerPracticeRoutes(app: Express) {
  // GET /api/practices — paginated practice list with metrics
  app.get("/api/practices", requireAuth, async (req, res) => {
    try {
      const filters = {
        search: (req.query.search as string) || undefined,
        sortBy: (req.query.sortBy as string) || "totalReferrals",
        sortOrder: (req.query.sortOrder as string) || "desc",
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
      };
      const result = await storage.getPractices(filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/practices/:name/detail — single practice with all physicians
  app.get("/api/practices/:name/detail", requireAuth, async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name).trim();
      if (!name) return res.status(400).json({ message: "Practice name required" });
      const detail = await storage.getPracticeDetail(name);
      if (!detail) return res.status(404).json({ message: "Practice not found" });
      res.json(detail);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
```

### Step 4: Register Routes

In `server/routes.ts`, add:

```typescript
import { registerPracticeRoutes } from "./routes/practice-intelligence";
// ... in registerRoutes():
registerPracticeRoutes(app);
```

## Todo List

- [ ] Define `PracticeSummary` and `PracticeDetail` interfaces in `server/storage.ts`
- [ ] Add `getPractices()` and `getPracticeDetail()` to `IStorage`
- [ ] Implement `getPractices()` in `DatabaseStorage`
- [ ] Implement `getPracticeDetail()` in `DatabaseStorage`
- [ ] Create `server/routes/practice-intelligence.ts`
- [ ] Register in `server/routes.ts`
- [ ] Run `npm run check` to verify compilation
- [ ] Test endpoints manually: `GET /api/practices`, `GET /api/practices/SomeName/detail`

## Success Criteria

- `GET /api/practices` returns paginated list with physicianCount, totalReferrals, totalRevenue, arrivalRate, lastInteractionAt
- `GET /api/practices/:name/detail` returns practice summary + physician array with individual metrics
- Search filter works on practice name and city
- Sorting works on all columns
- TypeScript compiles cleanly

## Risk Assessment

- **Practice name normalization:** Different casing/whitespace causes duplicates. Mitigation: `TRIM()` in SQL `GROUP BY`.
- **Performance with large datasets:** Subqueries on referrals and monthly summaries for every practice. Mitigation: indexes already exist on `physician_id` columns; paginate to 50 per page.

## Security Considerations

- `requireAuth` only (not role-restricted) since existing provider-offices uses same pattern
- No mutation endpoints, read-only
