# Phase Implementation Report

### Executed Phase
- Phase: phase-04-billing-lag-tracker + phase-05-appeal-generator
- Plan: plans/260227-0922-revenue-leakage-recovery-engine/
- Status: completed

### Files Modified
| File | Action | Lines |
|------|--------|-------|
| `shared/schema.ts` | Added revenue recovery tables + 3 new alert enum values | +180 lines |
| `server/routes.ts` | Registered 2 new route modules | +4 lines |

### Files Created
| File | Lines | Purpose |
|------|-------|---------|
| `server/storage-billing-lag-types.ts` | 48 | Shared TS interfaces for billing lag |
| `server/storage-billing-lag.ts` | 145 | AR aging buckets, overall metrics, stale claims |
| `server/storage-billing-lag-breakdowns.ts` | 112 | By-payer and by-location breakdown queries |
| `server/billing-lag-alert-engine.ts` | 115 | Fires HIGH_BILLING_LAG / HIGH_AR_AGING alerts |
| `server/routes/billing-lag.ts` | 122 | 6 billing lag endpoints |
| `server/storage-appeal-templates.ts` | 158 | Template CRUD, denial-code matching, seed, appeal stats |
| `server/storage-appeals.ts` | 181 | Appeal generation, CRUD, status transitions |
| `server/routes/revenue-recovery-appeals.ts` | 176 | 9 appeal endpoints |

### Tasks Completed
- [x] AR aging buckets (0-30, 31-60, 61-90, 90+) grouped from claims.status IN ('SUBMITTED','PARTIAL')
- [x] Billing lag metrics: avg days DOS→submission, submission→payment, total cycle
- [x] By-payer and by-location lag breakdowns
- [x] Stale claims detection (no submission_date after N days threshold)
- [x] Billing lag alert engine — HIGH_BILLING_LAG, HIGH_AR_AGING with deduplication
- [x] Extended `financialAlertTypeEnum` with HIGH_BILLING_LAG, HIGH_AR_AGING, UNDERPAYMENT_RATE
- [x] Appeal template CRUD (upsert = create+update via id presence)
- [x] Template soft delete (isActive=false)
- [x] 3 default templates seeded on first startup (CO-50/55, generic underpayment, CO-16/252)
- [x] Appeal generation with `{{placeholder}}` substitution from claim+location+user data
- [x] Denial-code template matching (most specific → generic fallback)
- [x] Appeal status transitions: DRAFTED→SUBMITTED→WON/LOST/EXPIRED
- [x] Appeal outcome stats: total, win rate, totalRecovered, avgRecoveryAmount
- [x] All files under 200 lines

### Schema Note
Phase 1-3 agent used a **flat/denormalized** `claims` table schema (payment_date, paid_amount, denial_codes directly on claim row) rather than the separate `claim_payments` join-based design from the plan spec. Implementation adapted accordingly — queries hit `claims.*` columns directly. `claim_payments` table exists for detail-level payment events but billing lag queries use the flat fields for simplicity.

### API Endpoints Registered
```
GET  /api/revenue/billing-lag/aging
GET  /api/revenue/billing-lag/metrics
GET  /api/revenue/billing-lag/by-payer
GET  /api/revenue/billing-lag/by-location
GET  /api/revenue/billing-lag/stale
POST /api/revenue/billing-lag/evaluate-alerts

GET    /api/revenue/appeal-templates
GET    /api/revenue/appeal-templates/:id
POST   /api/revenue/appeal-templates
DELETE /api/revenue/appeal-templates/:id
GET    /api/revenue/appeals
GET    /api/revenue/appeals/:id
GET    /api/revenue/appeals/stats
POST   /api/revenue/appeals/generate
PATCH  /api/revenue/appeals/:id
```

### Tests Status
- Type check: pass (0 errors in Phase 4-5 files)
- Unit tests: 153/153 pass

### Issues Encountered
- Phase 1-3 schema differs from plan spec: flat `claims` table vs. normalized join pattern. Adapted all queries to match actual schema.
- `appealStatusEnum` in schema uses name `claim_appeal_status` (to avoid conflict with existing `approvalStatusEnum`). No impact on queries.

### Next Steps
- Phase 6 (data import) can wire `evaluateBillingLagAlerts()` into the claims import flow
- `UNDERPAYMENT_RATE` alert type added to enum but not yet evaluated — Phase 2-3 reimbursement engine can call it
