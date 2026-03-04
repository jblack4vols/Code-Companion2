---
title: "Improvement Backlog"
description: "Ranked improvement items by ROI for an 8-location physician referral CRM"
status: in-progress
priority: P0
effort: 40h
tags: [security, data-integrity, operations, maintenance]
created: 2026-02-27
---

# Improvement Backlog

Ranked by ROI for an 8-location physician referral CRM. Evidence from codebase only.

## Summary

Tracked improvements across security (P0), operational (P1), and quality-of-life (P2) categories. Most P0 and P1 items have been completed. Remaining open items focus on location scoping enforcement, at-risk referral alerting, and referral-to-arrival conversion tracking.

## Phases

| # | Phase | Status | Effort | Depends On |
|---|---|---|---|---|
| 1 | Security & Data Integrity (P0) | in-progress | 12h | -- |
| 2 | Operational Improvements (P1) | in-progress | 16h | -- |
| 3 | Quality-of-Life & Maintainability (P2) | completed | 12h | -- |

## Phase 1: Security & Data Integrity (P0)

### Tasks

- [x] Enforce ownership checks on mutations (interactions, referrals, calendar events, tasks)
- [x] Guard PATCH /api/tasks/:id — require assigned user or DIRECTOR+ role
- [ ] Enforce location scoping — wire user_location_access into storage queries so FRONT_DESK/MARKETER only see their locations' data

## Phase 2: Operational Improvements (P1)

### Tasks

- [x] Role-guard GET /api/users — restrict full user list to DIRECTOR+
- [x] Role-guard financial data — restrict GET /api/collections and executive dashboard to DIRECTOR+/ANALYST
- [ ] At-risk referral source detection — query physicians with referrals down >20% over 2 months + no touchpoint in 30 days
- [ ] Referral-to-arrival conversion tracking per location — surface arrivedVisits/scheduledVisits ratio on location dashboard
- [x] Move hardcoded SMTP config to env vars
- [x] Deduplicate auth middleware
- [x] Add FK constraint for physicians.territoryId

## Phase 3: Quality-of-Life & Maintainability (P2)

### Tasks

- [x] Implement interaction_templates storage layer — add CRUD methods to IStorage/DatabaseStorage
- [x] Wire physician_stage_history into storage — add query methods, expose timeline on physician detail
- [x] Remove unused dependencies — passport, passport-local, csrf-csrf, memorystore
- [x] Add location-scoped API key filtering — public API keys restrict data to specific locations
- [x] Strengthen seed password handling — fail startup if SEED_OWNER_PASSWORD env var is unset in production
