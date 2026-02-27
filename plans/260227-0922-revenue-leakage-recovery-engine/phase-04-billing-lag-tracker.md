# Phase 04: Billing Lag Tracker

## Context Links
- [Phase 01 - Data Model](./phase-01-data-model.md)
- [Phase 02 - Reimbursement Engine](./phase-02-reimbursement-engine.md)
- [Existing alert engine pattern](../../server/unit-economics-alert-engine.ts)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 3h
- **Depends on:** Phase 01 (schema), Phase 02 (claim storage)
- Track days from DOS to claim submission, submission to payment, AR aging buckets, configurable alerts

## Key Insights
- **Billing lag** = `submission_date - date_of_service` (days)
- **Payment lag** = `payment_date - submission_date` (days)
- **Total cycle** = `payment_date - date_of_service` (days)
- AR aging buckets: 0-30, 31-60, 61-90, 90+ days (measured from DOS for unpaid claims)
- All timing data already exists in `claims` and `claim_payments` tables -- this phase is purely analytics + alerts
- Alert engine follows `unit-economics-alert-engine.ts` pattern: evaluated after import, not scheduled

## Storage Functions

Add to `server/storage-revenue-recovery.ts`.

### Billing Lag Metrics

```typescript
// getBillingLagSummary(filters: { locationId?, providerId?, payer?, dateFrom?, dateTo? })
//   Returns: {
//     avgBillingLag, medianBillingLag, avgPaymentLag, avgTotalCycle,
//     claimsOverThreshold, totalClaims,
//     p90BillingLag, p90PaymentLag
//   }

// getBillingLagByLocation(dateFrom?, dateTo?)
//   Returns: Array<{ locationId, locationName, avgBillingLag, avgPaymentLag,
//                     claimsCount, claimsOverThreshold }>

// getBillingLagByPayer(dateFrom?, dateTo?)
//   Returns: Array<{ payer, avgBillingLag, avgPaymentLag, claimsCount }>

// getBillingLagTrend(filters: { groupBy: 'month'|'week', locationId? })
//   Returns: Array<{ period, avgBillingLag, avgPaymentLag, claimsCount }>
```

### AR Aging

```typescript
// getArAging(filters: { locationId?, payer? })
//   Returns: {
//     current: { count, amount },    // 0-30 days
//     days31_60: { count, amount },
//     days61_90: { count, amount },
//     days90Plus: { count, amount },
//     total: { count, amount }
//   }

// getArAgingByLocation()
//   Returns: Array<{ locationId, locationName, ...same buckets }>

// getArAgingDetail(bucket: '0-30'|'31-60'|'61-90'|'90+', filters)
//   Returns: Array<ClaimWithAgingInfo> -- individual claims in that bucket
```

### Key SQL: Billing Lag Summary

```sql
SELECT
  COUNT(*) as total_claims,
  ROUND(AVG(c.submission_date::date - c.date_of_service::date), 1) as avg_billing_lag,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY c.submission_date::date - c.date_of_service::date
  ) as median_billing_lag,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY c.submission_date::date - c.date_of_service::date
  ) as p90_billing_lag,
  ROUND(AVG(
    CASE WHEN cp.payment_date IS NOT NULL
      THEN cp.payment_date::date - c.submission_date::date
    END
  ), 1) as avg_payment_lag,
  ROUND(AVG(
    CASE WHEN cp.payment_date IS NOT NULL
      THEN cp.payment_date::date - c.date_of_service::date
    END
  ), 1) as avg_total_cycle,
  COUNT(*) FILTER (
    WHERE c.submission_date::date - c.date_of_service::date > $threshold
  ) as claims_over_threshold
FROM claims c
LEFT JOIN (
  SELECT claim_id, MIN(payment_date) as payment_date
  FROM claim_payments WHERE is_denial = false
  GROUP BY claim_id
) cp ON cp.claim_id = c.id
WHERE c.submission_date IS NOT NULL
  AND c.date_of_service >= $dateFrom
```

### Key SQL: AR Aging Buckets

```sql
WITH unpaid AS (
  SELECT
    c.id, c.claim_number, c.location_id, c.payer,
    c.billed_amount,
    COALESCE(paid.total_paid, 0) as total_paid,
    c.billed_amount - COALESCE(paid.total_paid, 0) as outstanding,
    CURRENT_DATE - c.date_of_service::date as days_outstanding
  FROM claims c
  LEFT JOIN (
    SELECT claim_id, SUM(paid_amount) as total_paid
    FROM claim_payments WHERE is_denial = false
    GROUP BY claim_id
  ) paid ON paid.claim_id = c.id
  WHERE c.status NOT IN ('PAID', 'VOID', 'DENIED')
    AND c.billed_amount - COALESCE(paid.total_paid, 0) > 0
)
SELECT
  CASE
    WHEN days_outstanding <= 30 THEN '0-30'
    WHEN days_outstanding <= 60 THEN '31-60'
    WHEN days_outstanding <= 90 THEN '61-90'
    ELSE '90+'
  END as bucket,
  COUNT(*) as claim_count,
  SUM(outstanding)::float as total_amount
FROM unpaid
GROUP BY bucket
ORDER BY bucket
```

## Alert Engine

### File: `server/revenue-recovery-alert-engine.ts`

Follow `unit-economics-alert-engine.ts` pattern. Add new alert types to `financialAlertTypeEnum` or create separate enum.

**Option chosen:** Extend existing `financialAlertTypeEnum` with new values:
- `HIGH_BILLING_LAG` -- avg billing lag exceeds threshold (default: 7 days)
- `HIGH_AR_AGING` -- claims in 90+ bucket exceed threshold count
- `UNDERPAYMENT_RATE` -- underpayment rate exceeds threshold (default: 15%)

**Note:** Adding enum values requires updating `shared/schema.ts` `financialAlertTypeEnum`. Drizzle `db:push` handles enum expansion.

### Alert Rules

```typescript
const REVENUE_RECOVERY_ALERT_RULES = [
  {
    alertType: "HIGH_BILLING_LAG",
    metricName: "avg_billing_lag_days",
    defaultThreshold: 7,
    comparison: "gt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Avg billing lag ${actual.toFixed(1)} days exceeds ${thresh}-day threshold`,
  },
  {
    alertType: "HIGH_AR_AGING",
    metricName: "ar_90plus_count",
    defaultThreshold: 20,
    comparison: "gt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: ${actual} claims aged 90+ days (threshold: ${thresh})`,
  },
  {
    alertType: "UNDERPAYMENT_RATE",
    metricName: "underpayment_rate_pct",
    defaultThreshold: 15,
    comparison: "gt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Underpayment rate ${actual.toFixed(1)}% exceeds ${thresh}% threshold`,
  },
];
```

### Evaluate Function

```typescript
export async function evaluateRevenueRecoveryAlerts(locationId?: string): Promise<number>
```

Called after claim/payment import. Follows same dedup pattern (skip if unacknowledged alert of same type+location exists).

## API Routes

Add to `server/routes/revenue-recovery.ts`.

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/revenue-recovery/billing-lag/summary` | OWNER,DIRECTOR,ANALYST | Avg/median/p90 lag metrics |
| GET | `/api/revenue-recovery/billing-lag/by-location` | OWNER,DIRECTOR,ANALYST | Per-clinic lag breakdown |
| GET | `/api/revenue-recovery/billing-lag/by-payer` | OWNER,DIRECTOR,ANALYST | Per-payer lag breakdown |
| GET | `/api/revenue-recovery/billing-lag/trend` | OWNER,DIRECTOR,ANALYST | Monthly/weekly lag trend |
| GET | `/api/revenue-recovery/ar-aging` | OWNER,DIRECTOR,ANALYST | AR aging buckets |
| GET | `/api/revenue-recovery/ar-aging/by-location` | OWNER,DIRECTOR,ANALYST | AR aging per clinic |
| GET | `/api/revenue-recovery/ar-aging/detail` | OWNER,DIRECTOR,ANALYST | Claims in specific bucket |
| POST | `/api/revenue-recovery/alerts/evaluate` | OWNER,DIRECTOR | Trigger alert engine |

### Response: AR Aging

```json
{
  "current": { "count": 312, "amount": 46800 },
  "days31_60": { "count": 87, "amount": 13050 },
  "days61_90": { "count": 34, "amount": 5100 },
  "days90Plus": { "count": 18, "amount": 2700 },
  "total": { "count": 451, "amount": 67650 }
}
```

## Implementation Steps

1. Add billing lag + AR aging storage functions
2. Extend `financialAlertTypeEnum` with 3 new values in `shared/schema.ts`
3. Create `server/revenue-recovery-alert-engine.ts`
4. Add billing lag + AR aging API endpoints
5. Wire alert evaluation to import flow (Phase 06)
6. Run `npm run db:push` then `npm run check`

## Related Code Files
- **Modify:** `server/storage-revenue-recovery.ts`
- **Modify:** `shared/schema.ts` (extend `financialAlertTypeEnum`)
- **Create:** `server/revenue-recovery-alert-engine.ts`
- **Modify:** `server/routes/revenue-recovery.ts`

## Todo List
- [ ] Implement billing lag summary query
- [ ] Implement billing lag by location/payer
- [ ] Implement billing lag trend (monthly)
- [ ] Implement AR aging bucket query
- [ ] Implement AR aging by location
- [ ] Implement AR aging detail (claims in bucket)
- [ ] Extend financialAlertTypeEnum
- [ ] Create revenue recovery alert engine
- [ ] Wire up API endpoints
- [ ] Verify `npm run check` passes

## Success Criteria
- [ ] Billing lag metrics calculated correctly (avg, median, p90)
- [ ] AR aging buckets sum to total outstanding
- [ ] Alert engine fires for billing lag > 7 days and 90+ claims > 20
- [ ] All queries support location/payer/date filters

## Risk Assessment
- **Null submission dates:** Claims without submission_date are excluded from billing lag (but included in AR aging based on DOS)
- **Enum expansion:** PostgreSQL ALTER TYPE ADD VALUE is non-transactional; `db:push` handles this but cannot be rolled back
- **Performance:** AR aging query scans all open claims; index on `status` + `date_of_service` ensures adequate performance for 8 clinics
