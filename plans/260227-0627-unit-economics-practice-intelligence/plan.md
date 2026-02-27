---
title: "Practice Intelligence & Unit Economics Engine"
description: "Multi-physician practice cohorts + real-time unit economics/margin intelligence for 8-location PT company"
status: pending
priority: P1
effort: 32h
branch: jb/authz-phase1
tags: [analytics, finance, practice-intelligence, unit-economics]
created: 2026-02-27
---

# Practice Intelligence & Unit Economics Engine

## Summary

Two major features for a physician referral CRM serving an 8-location physical therapy company:

- **Feature A: Practice Intelligence** -- Aggregate physicians by `practiceName`, expose practice-level metrics (referral count, revenue, arrival rate), drill into individual physician cards.
- **Feature B: Unit Economics Engine** -- New financial subsystem: 4 new tables, CRUD+aggregation storage layer, 10 API endpoints, alert engine, 6 frontend pages, CSV import pipeline, role-based access.

## Architecture Decisions

1. **Practice Intelligence reuses existing `provider-offices` pattern** -- The codebase already has `/api/provider-offices` endpoints. Feature A extends these with revenue/arrival-rate aggregation rather than creating a duplicate endpoint namespace. New route: `/api/practices` with richer metrics.
2. **Unit Economics as standalone route module** -- `server/routes/unit-economics.ts` registered in `server/routes.ts`, follows the `registerXxxRoutes(app)` pattern.
3. **Alert engine runs post-import** -- Not a cron job. Triggered after `POST /api/unit-economics/financials` and `POST /api/unit-economics/financials/import`. Keeps it simple; can add cron later if needed.
4. **Schema uses `drizzle-kit push`** -- No migration files. Tables defined in `shared/schema.ts`, pushed via `npm run db:push`.

## Phases

| # | Phase | Status | Effort | Depends On |
|---|---|---|---|---|
| 1 | Data Model (schema.ts) | pending | 3h | -- |
| 2 | Practice Intelligence Backend | pending | 4h | Phase 1 |
| 3 | Unit Economics Backend | pending | 8h | Phase 1 |
| 4 | Practice Intelligence Frontend | pending | 4h | Phase 2 |
| 5 | Unit Economics Frontend | pending | 8h | Phase 3 |
| 6 | Data Import Pipeline | pending | 3h | Phase 3 |
| 7 | Testing | pending | 2h | Phases 2-6 |

## Key Dependencies

- Existing tables: `locations`, `physicians`, `referrals`, `users`, `physicianMonthlySummary`
- Existing infra: `requireRole()` middleware, `IStorage` interface, `db` Drizzle instance
- Existing import pattern: `server/routes/import.ts` (multer + ExcelJS)
- Frontend: TanStack Query, shadcn/ui, Recharts, wouter routing

## Files Modified (Summary)

| File | Change |
|---|---|
| `shared/schema.ts` | +4 tables, +4 enums, +4 insert schemas, +4 types |
| `server/storage.ts` | +IStorage methods for practices, financials, productivity, alerts, targets |
| `server/routes.ts` | Register `registerPracticeRoutes`, `registerUnitEconomicsRoutes` |
| `server/routes/practice-intelligence.ts` | NEW -- 2 endpoints |
| `server/routes/unit-economics.ts` | NEW -- 10 endpoints |
| `server/unit-economics-alert-engine.ts` | NEW -- alert evaluation logic |
| `server/db.ts` | +indexes for new tables |
| `client/src/App.tsx` | +4 route entries |
| `client/src/components/app-sidebar.tsx` | +sidebar nav items |
| `client/src/pages/practice-intelligence.tsx` | NEW -- practice list + detail |
| `client/src/pages/unit-economics-dashboard.tsx` | NEW -- heat map overview |
| `client/src/pages/unit-economics-location-detail.tsx` | NEW -- single location financials |
| `client/src/pages/unit-economics-provider-productivity.tsx` | NEW -- provider leaderboard |
| `client/src/pages/unit-economics-alerts.tsx` | NEW -- alert management |
| `client/src/pages/unit-economics-targets.tsx` | NEW -- threshold configuration |
| `client/src/pages/unit-economics-data-import.tsx` | NEW -- CSV upload for financials |
| `docs/permissions.md` | +unit economics role matrix |
| `docs/system-architecture.md` | +unit economics subsystem section |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `practiceName` data quality (nulls, inconsistent casing) | High | Medium | Use `TRIM(LOWER(...))` normalization; show "Unaffiliated" for nulls |
| Large financial dataset queries | Medium | Medium | Indexes on (locationId, periodDate); limit date range queries |
| Alert noise (too many alerts) | Medium | Low | Configurable thresholds via `financial_targets` table |
| CSV format mismatch from QuickBooks | Medium | Medium | Preview step before import; flexible column mapping |
