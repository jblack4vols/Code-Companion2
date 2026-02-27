# Phase 08: Testing

## Context Links
- [All phases](./plan.md)
- [Development rules](../../.claude/rules/development-rules.md)

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 2h
- **Depends on:** All previous phases
- Unit tests for storage queries, API endpoint integration tests, frontend smoke tests

## Key Insights
- Project uses vitest
- Test real queries against database (no mocks for storage layer)
- API tests use supertest pattern if available, otherwise direct function calls
- Frontend tests verify component rendering (not E2E)
- Focus on business logic: underpayment detection, denial aggregation, appeal generation, AR aging buckets

## Test Plan

### 1. Storage Layer Tests

**File:** `server/__tests__/storage-revenue-recovery.test.ts`

#### Claims CRUD
- [ ] `upsertClaim` creates new claim
- [ ] `upsertClaim` updates existing claim by claimNumber (upsert)
- [ ] `getClaims` returns paginated results
- [ ] `getClaims` filters by locationId, payer, status, dateRange
- [ ] `getClaimById` returns claim with all payments joined

#### Payer Rate Schedule
- [ ] `upsertPayerRate` creates rate entry
- [ ] `upsertPayerRate` updates on conflict (payer+cptCode+effectiveDate)
- [ ] `getPayerRateSchedule` filters by payer and cptCode

#### Underpayment Analysis
- [ ] `getUnderpaidClaims` returns claims where totalPaid < expectedAmount * 0.95
- [ ] `getUnderpaidClaims` excludes VOID and DENIED claims
- [ ] `getUnderpaidClaims` excludes claims with null expectedAmount
- [ ] `getUnderpaymentSummary` calculates correct totals and rates
- [ ] `getUnderpaymentByPayer` groups correctly

#### Denial Aggregation
- [ ] `getDenialSummary` counts denied claims correctly
- [ ] `getDenialsByCode` unnests JSONB array and counts per code
- [ ] `getDenialsByCode` joins denial_codes lookup for descriptions
- [ ] `getDenialsByProvider` calculates per-provider denial rate
- [ ] `getDenialsByProvider` flags outliers (> 2x average)
- [ ] `getDenialTrend` returns monthly time series

#### Billing Lag
- [ ] `getBillingLagSummary` calculates avg, median, p90
- [ ] `getBillingLagSummary` excludes claims without submissionDate
- [ ] `getArAging` assigns claims to correct buckets
- [ ] `getArAging` bucket amounts sum to total outstanding

#### Appeals
- [ ] `generateAppeal` replaces all placeholders
- [ ] `generateAppeal` selects matching template by denial codes
- [ ] `generateAppeal` falls back to generic template
- [ ] `updateAppealStatus` enforces valid transitions (DRAFTED->SUBMITTED only)
- [ ] `updateAppealStatus` rejects invalid transitions (DRAFTED->WON)
- [ ] `getAppealOutcomeSummary` calculates win rate and total recovered

### 2. API Route Tests

**File:** `server/__tests__/routes-revenue-recovery.test.ts`

#### Auth & Role Tests
- [ ] All endpoints return 401 for unauthenticated requests
- [ ] ANALYST can GET but cannot POST/PATCH/DELETE
- [ ] MARKETER and FRONT_DESK receive 403
- [ ] OWNER bypasses all role checks

#### Endpoint Tests
- [ ] `GET /api/revenue-recovery/claims` returns paginated list
- [ ] `POST /api/revenue-recovery/claims` creates claim
- [ ] `GET /api/revenue-recovery/underpayments` returns underpaid claims
- [ ] `GET /api/revenue-recovery/underpayments/summary` returns aggregates
- [ ] `GET /api/revenue-recovery/rates` returns rate schedule
- [ ] `POST /api/revenue-recovery/rates` creates rate (OWNER only)
- [ ] `GET /api/revenue-recovery/denials/summary` returns denial stats
- [ ] `GET /api/revenue-recovery/denials/by-provider` includes outlier flag
- [ ] `GET /api/revenue-recovery/billing-lag/summary` returns lag metrics
- [ ] `GET /api/revenue-recovery/ar-aging` returns bucket data
- [ ] `POST /api/revenue-recovery/appeals/generate` creates appeal
- [ ] `PATCH /api/revenue-recovery/appeals/:id/status` updates status

### 3. Import Tests

**File:** `server/__tests__/revenue-recovery-import.test.ts`

- [ ] Claims import resolves location names to IDs
- [ ] Claims import resolves provider names to user IDs
- [ ] Claims import parses CPT codes from comma-separated string
- [ ] Claims import handles date formats (MM/DD/YYYY, YYYY-MM-DD, Excel serial)
- [ ] Claims import upserts by claimNumber
- [ ] Payments import links to existing claims by claimNumber
- [ ] Payments import sets isDenial flag when denial codes present
- [ ] Payments import updates claim status after payment
- [ ] Payments import skips unknown claim numbers with error
- [ ] Rate schedule import creates payer_rate_schedule entries
- [ ] Denial code import populates lookup table
- [ ] Import triggers alert evaluation

### 4. Alert Engine Tests

**File:** `server/__tests__/revenue-recovery-alert-engine.test.ts`

- [ ] `evaluateRevenueRecoveryAlerts` creates HIGH_BILLING_LAG alert when avg > threshold
- [ ] `evaluateRevenueRecoveryAlerts` creates HIGH_AR_AGING alert when 90+ count > threshold
- [ ] `evaluateRevenueRecoveryAlerts` creates UNDERPAYMENT_RATE alert when rate > threshold
- [ ] Alert engine skips duplicate unacknowledged alerts
- [ ] Alert engine respects custom thresholds from financial_targets

### 5. Frontend Smoke Tests

**File:** `client/src/__tests__/revenue-recovery-pages.test.tsx`

Minimal tests verifying pages render without crashing:

- [ ] RevenueRecoveryDashboard renders loading state
- [ ] RevenueRecoveryClaims renders filter bar + table
- [ ] RevenueRecoveryDenials renders tab navigation
- [ ] RevenueRecoveryBillingLag renders summary cards
- [ ] RevenueRecoveryAppeals renders appeal list
- [ ] RevenueRecoveryImport renders import type selector

## Test Data Fixtures

Create fixture file `server/__tests__/fixtures/revenue-recovery-fixtures.ts`:

```typescript
export const testClaim = {
  claimNumber: "TEST-CLM-001",
  locationId: "test-loc-1",
  providerId: "test-user-1",
  patientName: "Test Patient",
  payer: "BCBS",
  payerType: "COMMERCIAL" as const,
  dateOfService: "2026-01-15",
  cptCodes: ["97110", "97140"],
  billedAmount: "180.00",
  expectedAmount: "153.00",
  submissionDate: "2026-01-18",
  status: "SUBMITTED" as const,
  source: "test",
};

export const testPayment = {
  paidAmount: "127.00",
  adjustmentAmount: "0.00",
  paymentDate: "2026-02-10",
  denialCodes: [],
  adjustmentCodes: [],
  remarkCodes: [],
  isDenial: false,
};

export const testDenialPayment = {
  paidAmount: "0.00",
  adjustmentAmount: "153.00",
  paymentDate: "2026-02-10",
  denialCodes: ["CO-4"],
  adjustmentCodes: ["CO-4"],
  remarkCodes: ["N479"],
  isDenial: true,
};

export const testPayerRate = {
  payer: "BCBS",
  cptCode: "97110",
  expectedRate: "85.00",
  effectiveDate: "2026-01-01",
  source: "contract",
};

export const testAppealTemplate = {
  name: "Test Medical Necessity Template",
  denialCodePattern: "CO-50,CO-55",
  templateBody: "Dear {{payer}}, Claim {{claimNumber}} for {{patientName}} on {{dateOfService}} was denied...",
  isActive: true,
};
```

## Implementation Steps

1. Create test fixture file
2. Write storage layer tests (highest priority -- validates business logic)
3. Write API route tests
4. Write import tests
5. Write alert engine tests
6. Write frontend smoke tests
7. Run full test suite, fix failures
8. Verify coverage of critical paths

## Success Criteria
- [ ] All tests pass (`npm test`)
- [ ] No mocked storage queries -- real DB queries tested
- [ ] Underpayment detection logic verified with edge cases
- [ ] Denial aggregation JSONB unnest verified
- [ ] AR aging bucket assignment verified
- [ ] Appeal placeholder replacement verified
- [ ] Import date parsing verified (3+ formats)
- [ ] Role-based access enforced in API tests

## Risk Assessment
- **Test database:** Tests need a clean database state; use transaction rollback or test-specific setup/teardown
- **Test isolation:** Run tests serially if they share database state
- **Flaky percentile tests:** PERCENTILE_CONT may return slightly different values depending on data distribution; use approximate assertions
