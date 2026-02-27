---
title: "Revenue Leakage & Underpayment Recovery Engine"
description: "Claim-level tracking of underpayments, denials, billing lag, and auto-appeal generation for 8-clinic PT practice"
status: pending
priority: P1
effort: 28h
branch: jb/authz-phase1
tags: [revenue-cycle, claims, denials, appeals, billing]
created: 2026-02-27
---

# Revenue Leakage & Underpayment Recovery Engine

## Problem Statement

~5,600 visits/month across 8 clinics with no visibility into underpayments, denial patterns, billing lag, or systematic appeal generation. Revenue leakage is unquantified.

## Architecture Overview

Four subsystems, all built on a shared `claims` + `claim_payments` data foundation:

1. **Expected Reimbursement Model** -- payer rate schedules, underpayment flagging
2. **Denial Pattern Intelligence** -- CARC/RARC tracking, trend analysis by provider/clinic
3. **Billing Lag Tracker** -- DOS-to-submission-to-payment timing, AR aging buckets
4. **Auto-Appeal Draft Generator** -- template engine with claim data merge, status tracking

## Phase Summary

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Data Model (schema + indexes) | 3h | pending | [phase-01](./phase-01-data-model.md) |
| 2 | Reimbursement Engine (storage + API) | 4h | pending | [phase-02](./phase-02-reimbursement-engine.md) |
| 3 | Denial Intelligence (aggregation + trending) | 4h | pending | [phase-03](./phase-03-denial-intelligence.md) |
| 4 | Billing Lag Tracker (AR aging + alerts) | 3h | pending | [phase-04](./phase-04-billing-lag-tracker.md) |
| 5 | Appeal Generator (templates + CRUD) | 3h | pending | [phase-05](./phase-05-appeal-generator.md) |
| 6 | Data Import (CSV claims/payments/denials) | 4h | pending | [phase-06](./phase-06-data-import.md) |
| 7 | Frontend (React pages, 4 subsystems) | 5h | pending | [phase-07](./phase-07-frontend.md) |
| 8 | Testing | 2h | pending | [phase-08](./phase-08-testing.md) |

## Key Dependencies

- Phase 1 must complete first (all others depend on schema)
- Phases 2-5 can run in parallel after Phase 1
- Phase 6 depends on Phase 1 schema
- Phase 7 depends on Phases 2-5 (API endpoints)
- Phase 8 runs last

## Role Access Matrix

| Role | Claims CRUD | Rate Schedules | Dashboards | Appeals | Import |
|------|------------|----------------|------------|---------|--------|
| OWNER | Full | Full | Full | Full | Full |
| DIRECTOR | Full | Read | Full | Full | Full |
| ANALYST | Read | Read | Read | Read | None |
| MARKETER | None | None | None | None | None |
| FRONT_DESK | None | None | None | None | None |

## New Files Created

### Schema
- `shared/schema.ts` -- add 6 new tables + enums + types

### Backend
- `server/storage-revenue-recovery.ts` -- storage queries (~200 lines)
- `server/routes/revenue-recovery.ts` -- API routes (~200 lines)
- `server/routes/revenue-recovery-import.ts` -- import routes (~200 lines)
- `server/revenue-recovery-alert-engine.ts` -- underpayment + lag alerts (~100 lines)

### Frontend
- `client/src/pages/revenue-recovery-dashboard.tsx` -- main dashboard
- `client/src/pages/revenue-recovery-claims.tsx` -- claim list + detail
- `client/src/pages/revenue-recovery-denials.tsx` -- denial intelligence
- `client/src/pages/revenue-recovery-billing-lag.tsx` -- AR aging
- `client/src/pages/revenue-recovery-appeals.tsx` -- appeal management
- `client/src/pages/revenue-recovery-import.tsx` -- claim data import

### Modified Files
- `shared/schema.ts` -- new tables, enums, types
- `server/storage.ts` -- import + re-export new storage module
- `server/routes.ts` -- register new route modules
- `client/src/App.tsx` -- add routes
- `client/src/components/app-sidebar.tsx` -- add nav section
