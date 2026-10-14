---
title: "EBITDA Quick Wins Implementation"
description: "6 quick-win features to improve EBITDA visibility and reduce revenue leakage"
status: pending
priority: P1
effort: 8d
branch: kai/feat/ebitda-quick-wins
tags: [ebitda, analytics, revenue, quick-wins]
created: 2026-10-13
---

# EBITDA Quick Wins Implementation Plan

## Overview

Six features identified in the EBITDA improvement analysis (`plans/reports/ebitda-improvement-analysis.md`). Estimated combined EBITDA impact: $60-100K/year from improved visibility.

## Dependency Graph

```
QW-6 (Auth Columns) ──────────────────────── standalone schema change
QW-1 (Aging Queue) ───────────────────────── standalone (uses referrals table)
QW-2 (EBITDA Rollup) ─────────────────────── standalone (uses clinic_financials)
QW-3 (Referral-to-Claims) ──┐
                             ├── QW-4 depends on QW-3 linking logic
QW-4 (Payer Profitability) ──┘
QW-5 (Marketer ROI) ──────────────────────── standalone (adds users columns)
```

## Recommended Execution Order

| Phase | Feature | Effort | Dependencies | Status |
|-------|---------|--------|--------------|--------|
| 01 | QW-6: Authorization Expiration Alert | 1d | None (schema first) | pending |
| 02 | QW-1: Unscheduled Referral Aging Queue | 0.5d | None | pending |
| 03 | QW-2: Practice-Wide EBITDA Rollup | 1d | None | pending |
| 04 | QW-3: Referral-to-Claims Auto-Linking | 2d | None | pending |
| 05 | QW-4: Payer Profitability Matrix | 1.5d | QW-3 | pending |
| 06 | QW-5: Marketer ROI Dashboard | 2d | None (schema for compensation) | pending |

## Parallel Execution Groups

- **Group A** (independent): QW-6, QW-1, QW-2 can run in parallel
- **Group B** (sequential): QW-3 then QW-4
- **Group C** (independent): QW-5

## File Ownership Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 01 | `client/src/pages/auth-expiration-alerts.tsx` | `shared/schema.ts`, `server/storage-referrals.ts`, `server/routes/referrals.ts`, `client/src/App.tsx`, `client/src/components/app-sidebar.tsx` |
| 02 | `client/src/pages/referral-aging-queue.tsx` | `server/storage-referrals.ts`, `server/routes/referrals.ts`, `client/src/App.tsx`, `client/src/components/app-sidebar.tsx` |
| 03 | None | `server/storage-unit-economics.ts`, `server/routes/unit-economics.ts`, `client/src/pages/unit-economics-dashboard.tsx` |
| 04 | `server/storage-referral-claims.ts`, `server/routes/referral-claims.ts`, `client/src/pages/referral-claims-linking.tsx` | `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `client/src/App.tsx`, `client/src/components/app-sidebar.tsx` |
| 05 | `client/src/pages/payer-profitability.tsx` | `server/storage-revenue-recovery.ts`, `server/routes/revenue-recovery.ts`, `client/src/App.tsx`, `client/src/components/app-sidebar.tsx` |
| 06 | `server/storage-marketer-roi.ts`, `server/routes/marketer-roi.ts`, `client/src/pages/marketer-roi-dashboard.tsx` | `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `client/src/App.tsx`, `client/src/components/app-sidebar.tsx` |

## Phase Files

- [Phase 01: Authorization Expiration Alert](./phase-01-auth-expiration-alert.md)
- [Phase 02: Unscheduled Referral Aging Queue](./phase-02-referral-aging-queue.md)
- [Phase 03: Practice-Wide EBITDA Rollup](./phase-03-ebitda-rollup.md)
- [Phase 04: Referral-to-Claims Auto-Linking](./phase-04-referral-claims-linking.md)
- [Phase 05: Payer Profitability Matrix](./phase-05-payer-profitability.md)
- [Phase 06: Marketer ROI Dashboard](./phase-06-marketer-roi-dashboard.md)
