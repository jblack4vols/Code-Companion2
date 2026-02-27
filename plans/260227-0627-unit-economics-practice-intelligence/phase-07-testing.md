# Phase 7: Testing

## Context Links
- Test framework: vitest (in `package.json` devDependencies)
- Existing test patterns: check for `**/*.test.ts` or `**/*.spec.ts` files
- Backend routes: `server/routes/practice-intelligence.ts`, `server/routes/unit-economics.ts`
- Storage methods: `server/storage.ts`
- Alert engine: `server/unit-economics-alert-engine.ts`

## Overview
- **Priority:** P3
- **Status:** pending
- **Description:** Test plan covering backend storage methods, API endpoints, alert engine logic, and import parsing. Focus on integration tests for critical data paths.

## Key Insights
- Codebase uses vitest. Check if test infrastructure (vitest config, test setup) exists.
- Tests should focus on: data integrity (upserts, aggregation math), authorization (role guards), alert threshold logic, import parsing (date handling, column mapping).
- Frontend tests are lower priority; backend correctness is critical for financial data.

## Requirements

### Test Categories

#### 1. Storage Layer Tests

**File:** `server/__tests__/storage-practice-intelligence.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("Practice Intelligence Storage", () => {
  describe("getPractices", () => {
    it("aggregates physicians by practice name");
    it("returns correct physician count per practice");
    it("computes total referrals from referrals table");
    it("computes total revenue from physician_monthly_summary");
    it("computes arrival rate from scheduled/arrived visits");
    it("returns latest interaction date");
    it("filters by search term (practice name, city)");
    it("paginates results");
    it("sorts by each column");
    it("handles practices with null practice_name (excluded)");
    it("handles practices with no referrals (zero values)");
  });

  describe("getPracticeDetail", () => {
    it("returns all physicians at a given practice");
    it("enriches each physician with referral count and revenue");
    it("returns null for non-existent practice");
    it("handles case-insensitive practice name matching via TRIM");
  });
});
```

**File:** `server/__tests__/storage-unit-economics.test.ts`

```typescript
describe("Unit Economics Storage", () => {
  describe("upsertClinicFinancial", () => {
    it("inserts new record");
    it("updates existing record on conflict (same location+date+period)");
    it("preserves existing fields on partial update");
  });

  describe("getUnitEconomicsDashboard", () => {
    it("returns all active locations");
    it("computes revenue per visit correctly");
    it("computes cost per visit (labor + rent + supplies + other) / visits");
    it("computes labor percent as labor / revenue * 100");
    it("computes net margin as net_contribution / revenue * 100");
    it("includes active alert count per location");
    it("handles locations with no financial data (zero values)");
  });

  describe("getProviderProductivityLeaderboard", () => {
    it("returns providers sorted by revenue descending");
    it("computes target attainment percentage");
    it("filters by date range");
    it("joins user name and location name");
  });

  describe("getFinancialAlerts", () => {
    it("returns unacknowledged alerts by default");
    it("filters by locationId");
    it("returns acknowledged alerts when filter set");
  });

  describe("acknowledgeFinancialAlert", () => {
    it("sets acknowledgedAt and acknowledgedBy");
    it("returns undefined for non-existent alert");
    it("does not double-acknowledge already acknowledged alert");
  });

  describe("getFinancialTargets", () => {
    it("returns global targets (locationId null)");
    it("returns location-specific targets when locationId provided");
  });

  describe("upsertFinancialTarget", () => {
    it("inserts new target");
    it("updates existing target on conflict (location+metric)");
  });

  describe("getUnitEconomicsForecast", () => {
    it("returns forecast entries for locations with sufficient data");
    it("handles locations with less than 4 weeks of data (low confidence)");
    it("computes trend direction correctly");
  });
});
```

#### 2. Alert Engine Tests

**File:** `server/__tests__/unit-economics-alert-engine.test.ts`

```typescript
describe("Alert Engine", () => {
  describe("evaluateAlerts", () => {
    it("creates LOW_REVENUE_PER_VISIT alert when rev/visit < threshold");
    it("creates HIGH_COST_PER_VISIT alert when cost/visit > threshold");
    it("creates HIGH_LABOR_PERCENT alert when labor > threshold");
    it("uses location-specific threshold when available");
    it("falls back to global default threshold");
    it("does not create duplicate alert if unacknowledged one exists");
    it("creates new alert after previous was acknowledged");
    it("does not alert when metric is zero (no data)");
    it("scopes to single location when locationId passed");
  });

  describe("evaluateProviderAlerts", () => {
    it("creates LOW_PROVIDER_REVENUE alert for underperforming providers");
    it("uses provider revenue target from financial_targets");
    it("defaults to $5,700/week threshold");
  });
});
```

#### 3. API Route Tests

**File:** `server/__tests__/routes-unit-economics.test.ts`

```typescript
describe("Unit Economics Routes", () => {
  describe("Authorization", () => {
    it("GET /api/unit-economics/dashboard - 403 for MARKETER");
    it("GET /api/unit-economics/dashboard - 403 for FRONT_DESK");
    it("GET /api/unit-economics/dashboard - 200 for ANALYST");
    it("GET /api/unit-economics/dashboard - 200 for DIRECTOR");
    it("GET /api/unit-economics/dashboard - 200 for OWNER");
    it("POST /api/unit-economics/financials - 403 for ANALYST (read-only)");
    it("POST /api/unit-economics/financials - 200 for DIRECTOR");
    it("PATCH /api/unit-economics/targets - 403 for DIRECTOR (OWNER only)");
    it("PATCH /api/unit-economics/targets - 200 for OWNER");
    it("POST /api/unit-economics/alerts/:id/acknowledge - 403 for ANALYST");
    it("POST /api/unit-economics/alerts/:id/acknowledge - 200 for DIRECTOR");
  });

  describe("Data Validation", () => {
    it("POST /api/unit-economics/financials - rejects missing locationId");
    it("POST /api/unit-economics/financials - rejects invalid periodType");
    it("PATCH /api/unit-economics/targets - rejects non-array body");
  });

  describe("Audit Logging", () => {
    it("POST /api/unit-economics/financials creates audit log entry");
    it("PATCH /api/unit-economics/targets creates audit log entry");
    it("POST /api/unit-economics/financials/import creates audit log entry");
  });
});
```

#### 4. Import Pipeline Tests

**File:** `server/__tests__/unit-economics-import.test.ts`

```typescript
describe("Financial Import Pipeline", () => {
  describe("autoDetectMapping", () => {
    it("detects QuickBooks columns: Revenue, Location, Date");
    it("detects payroll columns: Labor, Rent, Supplies");
    it("detects Prompt BI columns: Provider, Visits, Units");
    it("returns null for unmatched columns");
  });

  describe("parseDateValue", () => {
    it("parses ISO date string '2026-01-15'");
    it("parses US date string '1/15/2026'");
    it("parses Excel serial date number 46037");
    it("parses Date object");
    it("returns null for invalid input");
  });

  describe("parseNum", () => {
    it("parses plain number 1234.56");
    it("parses currency string '$1,234.56'");
    it("parses negative number '-500'");
    it("returns 0 for null/undefined");
    it("returns 0 for non-numeric string");
  });

  describe("processFinancialImport", () => {
    it("maps QuickBooks rows to clinic_financials records");
    it("maps payroll rows to clinic_financials records");
    it("reports error for unknown location name");
    it("reports error for invalid date");
    it("upserts on duplicate location+date+period");
  });

  describe("processProviderImport", () => {
    it("maps Prompt BI rows to provider_productivity records");
    it("resolves provider by name to user ID");
    it("reports error for unknown provider name");
  });
});
```

#### 5. Practice Intelligence Route Tests

**File:** `server/__tests__/routes-practice-intelligence.test.ts`

```typescript
describe("Practice Intelligence Routes", () => {
  describe("GET /api/practices", () => {
    it("returns paginated practice list");
    it("filters by search term");
    it("sorts by totalReferrals (default)");
    it("sorts by totalRevenue");
    it("handles empty result set");
  });

  describe("GET /api/practices/:name/detail", () => {
    it("returns practice summary + physician list");
    it("returns 404 for non-existent practice");
    it("decodes URL-encoded practice name");
    it("returns 400 for empty name");
  });
});
```

## Implementation Steps

1. Check if vitest config exists (`vitest.config.ts` or in `package.json`)
2. Create test directory structure if not present: `server/__tests__/`
3. Create test utility for database seeding/cleanup (test fixtures)
4. Implement storage layer tests (highest priority -- financial math correctness)
5. Implement alert engine tests (threshold logic)
6. Implement route authorization tests
7. Implement import pipeline unit tests (parsing functions)
8. Run full test suite: `npx vitest run`

## Todo List

- [ ] Verify vitest config exists; create if needed
- [ ] Create test fixtures/helpers for seeding test data
- [ ] Write storage tests for practice intelligence
- [ ] Write storage tests for unit economics CRUD
- [ ] Write storage tests for aggregation queries
- [ ] Write alert engine tests
- [ ] Write route authorization tests
- [ ] Write import parsing unit tests
- [ ] Run full test suite
- [ ] Fix any failing tests

## Success Criteria

- All test suites pass (`npx vitest run`)
- Storage aggregation math verified (revenue per visit, cost per visit, labor %, margin)
- Alert engine threshold logic verified with edge cases
- Authorization matrix enforced (role-based 403s)
- Import parsing handles all date formats and currency formats
- No false positives in alert deduplication

## Risk Assessment

- **Test database:** Need a test database or mock storage. If using real DB, ensure test isolation (transaction rollback or dedicated test schema).
- **Test data volume:** Minimal seed data sufficient for unit tests. Don't need 5,600 visits.
- **vitest setup:** May need config for path aliases (`@shared/`, `@/`). Check existing vitest.config.ts.

## Security Considerations

- Tests should verify 403 responses for unauthorized roles
- Tests should verify audit log creation on mutations
- No real credentials in test fixtures
