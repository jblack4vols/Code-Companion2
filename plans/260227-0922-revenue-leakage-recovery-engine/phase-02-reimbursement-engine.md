# Phase 02: Expected Reimbursement Engine

## Context Links
- [Phase 01 - Data Model](./phase-01-data-model.md)
- [Existing storage pattern](../../server/storage-unit-economics.ts)
- [Existing route pattern](../../server/routes/unit-economics.ts)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 4h
- **Depends on:** Phase 01 (schema)
- Track expected vs actual payment per claim, flag underpayments, manage payer rate schedules

## Key Insights
- Expected amount per claim = SUM of expected rates for each CPT code from `payer_rate_schedule`
- Underpayment = totalPaid < expectedAmount (with configurable variance threshold, e.g., 5%)
- Historical rate building: aggregate actual payments by payer+CPT to seed initial rate schedule
- Manual override: OWNER can set/edit rates per payer+CPT combo

## Storage Layer

### File: `server/storage-revenue-recovery.ts`

Follow pattern from `storage-unit-economics.ts` -- export functions, re-export from `storage.ts`.

### Claim CRUD Functions

```typescript
// getClaims(filters) -- paginated list with payment summary joined
// getClaimById(id) -- single claim + all payments
// upsertClaim(data) -- insert or update by claimNumber
// bulkUpsertClaims(rows) -- batch import

// getClaimPayments(claimId) -- all payments for a claim
// createClaimPayment(data) -- add payment record
```

### Payer Rate Schedule Functions

```typescript
// getPayerRateSchedule(filters: { payer?, cptCode? }) -- list rates
// upsertPayerRate(data) -- insert or update rate
// bulkUpsertPayerRates(rows) -- batch import
// deletePayerRate(id) -- remove rate
// buildRatesFromHistory() -- aggregate historical payments to suggest rates
```

### Underpayment Analysis Functions

```typescript
// getUnderpaymentSummary(filters: { locationId?, payer?, dateFrom?, dateTo? })
//   Returns: { totalClaims, underpaidClaims, totalBilled, totalExpected,
//              totalPaid, totalVariance, underpaymentRate }

// getUnderpaidClaims(filters) -- claims where totalPaid < expectedAmount * (1 - threshold)
//   Returns: Array<{ claim, totalPaid, expectedAmount, variance, variancePct }>

// getUnderpaymentByPayer(dateFrom?, dateTo?)
//   Returns: Array<{ payer, claimCount, totalExpected, totalPaid, avgVariancePct }>
```

### Key SQL: Underpayment Query

```sql
SELECT
  c.id, c.claim_number, c.payer, c.date_of_service,
  c.billed_amount, c.expected_amount,
  COALESCE(SUM(cp.paid_amount), 0) as total_paid,
  c.expected_amount - COALESCE(SUM(cp.paid_amount), 0) as variance
FROM claims c
LEFT JOIN claim_payments cp ON cp.claim_id = c.id AND cp.is_denial = false
WHERE c.expected_amount IS NOT NULL
  AND c.status NOT IN ('VOID', 'DENIED')
GROUP BY c.id
HAVING COALESCE(SUM(cp.paid_amount), 0) < c.expected_amount * 0.95
ORDER BY variance DESC
```

### Key SQL: Build Rates from History

```sql
SELECT
  c.payer,
  unnest(c.cpt_codes) as cpt_code,
  ROUND(AVG(cp.paid_amount / array_length(c.cpt_codes, 1)), 2) as avg_rate,
  COUNT(*) as sample_size
FROM claims c
JOIN claim_payments cp ON cp.claim_id = c.id AND cp.is_denial = false
WHERE cp.paid_amount > 0
  AND c.date_of_service >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY c.payer, unnest(c.cpt_codes)
HAVING COUNT(*) >= 5
ORDER BY c.payer, cpt_code
```

## API Routes

### File: `server/routes/revenue-recovery.ts`

Pattern: `export async function registerRevenueRecoveryRoutes(app: Express)`

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/revenue-recovery/claims` | OWNER,DIRECTOR,ANALYST | Paginated claim list with payment totals |
| GET | `/api/revenue-recovery/claims/:id` | OWNER,DIRECTOR,ANALYST | Single claim + payments |
| POST | `/api/revenue-recovery/claims` | OWNER,DIRECTOR | Create/update claim |
| GET | `/api/revenue-recovery/underpayments` | OWNER,DIRECTOR,ANALYST | Underpaid claims list |
| GET | `/api/revenue-recovery/underpayments/summary` | OWNER,DIRECTOR,ANALYST | Aggregate underpayment stats |
| GET | `/api/revenue-recovery/underpayments/by-payer` | OWNER,DIRECTOR,ANALYST | Underpayment breakdown by payer |
| GET | `/api/revenue-recovery/rates` | OWNER,DIRECTOR,ANALYST | Payer rate schedule list |
| POST | `/api/revenue-recovery/rates` | OWNER | Create/update rate |
| DELETE | `/api/revenue-recovery/rates/:id` | OWNER | Delete rate |
| POST | `/api/revenue-recovery/rates/build-from-history` | OWNER | Auto-generate rates from historical data |
| POST | `/api/revenue-recovery/claims/:id/payments` | OWNER,DIRECTOR | Add payment to claim |

### Query Parameters (claims list)

```
?locationId=...&payer=...&status=...&dateFrom=...&dateTo=...&page=1&pageSize=50
```

### Response: Underpayment Summary

```json
{
  "totalClaims": 1240,
  "underpaidClaims": 187,
  "underpaymentRate": 15.1,
  "totalBilled": 524000,
  "totalExpected": 498000,
  "totalPaid": 461000,
  "totalVariance": 37000,
  "avgVariancePct": 7.4
}
```

### Response: Underpaid Claim Row

```json
{
  "id": "uuid",
  "claimNumber": "CLM-2026-00142",
  "payer": "BCBS",
  "dateOfService": "2026-02-10",
  "cptCodes": ["97110", "97140"],
  "billedAmount": 180,
  "expectedAmount": 153,
  "totalPaid": 127,
  "variance": 26,
  "variancePct": 17.0,
  "locationName": "Clinic A",
  "providerName": "Dr. Smith"
}
```

## Implementation Steps

1. Create `server/storage-revenue-recovery.ts` with claim CRUD, rate schedule CRUD, underpayment queries
2. Add imports + re-exports in `server/storage.ts` (follow unit-economics pattern)
3. Create `server/routes/revenue-recovery.ts` with all endpoints
4. Register routes in `server/routes.ts`: `await registerRevenueRecoveryRoutes(app)`
5. Run `npm run check` to verify compilation

## Related Code Files
- **Create:** `server/storage-revenue-recovery.ts`
- **Create:** `server/routes/revenue-recovery.ts`
- **Modify:** `server/storage.ts` (add imports/re-exports)
- **Modify:** `server/routes.ts` (register routes)

## Todo List
- [ ] Implement claim CRUD storage functions
- [ ] Implement payer rate schedule CRUD
- [ ] Implement underpayment analysis queries
- [ ] Implement build-rates-from-history logic
- [ ] Create API route file with all endpoints
- [ ] Register routes in `server/routes.ts`
- [ ] Add storage re-exports
- [ ] Verify `npm run check` passes

## Success Criteria
- [ ] All API endpoints return correct data
- [ ] Underpayment detection flags claims below threshold
- [ ] Rate schedule supports manual override
- [ ] Build-from-history generates reasonable rate suggestions

## Risk Assessment
- **Expected amount calculation:** For multi-CPT claims, sum individual CPT rates. If a CPT has no rate entry, mark expectedAmount as null (cannot evaluate)
- **Threshold configuration:** Default 5% variance threshold; store in `financial_targets` table (metricName: `underpayment_variance_pct`)
