# Phase 03: Denial Pattern Intelligence

## Context Links
- [Phase 01 - Data Model](./phase-01-data-model.md)
- [Phase 02 - Reimbursement Engine](./phase-02-reimbursement-engine.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 4h
- **Depends on:** Phase 01 (schema), Phase 02 (claim storage layer)
- Track denial codes (CARC/RARC), aggregate by provider/clinic/payer, identify actionable patterns, time-series trending

## Key Insights
- Denial data lives in `claim_payments.denial_codes` (JSONB array of code strings)
- `denial_codes` lookup table provides descriptions and categories
- Denial rate = denied claims / total claims (per grouping dimension)
- Actionable insight = provider-specific or clinic-specific denial rates significantly above average
- Time-series trending answers: "Is our denial rate for 97110 at Clinic B improving or worsening?"

## Storage Functions

Add to `server/storage-revenue-recovery.ts` (keep file under 200 lines; split into `server/storage-denial-intelligence.ts` if needed).

### Denial Aggregation Queries

```typescript
// getDenialSummary(filters: { locationId?, providerId?, payer?, dateFrom?, dateTo? })
//   Returns: { totalClaims, deniedClaims, denialRate, totalDeniedAmount, topDenialCodes[] }

// getDenialsByCode(filters)
//   Returns: Array<{ code, codeType, description, category, count, totalAmount, pctOfDenials }>
//   Sorted by count DESC

// getDenialsByProvider(filters)
//   Returns: Array<{ providerId, providerName, totalClaims, deniedClaims,
//                     denialRate, topCodes[], avgDenialRate }>
//   Flag providers with denialRate > 2x average

// getDenialsByLocation(filters)
//   Returns: Array<{ locationId, locationName, totalClaims, deniedClaims,
//                     denialRate, topCodes[] }>

// getDenialsByPayer(filters)
//   Returns: Array<{ payer, totalClaims, deniedClaims, denialRate, topCodes[] }>

// getDenialTrend(filters: { groupBy: 'month'|'week', cptCode?, payer?, locationId? })
//   Returns: Array<{ period, totalClaims, deniedClaims, denialRate }>
```

### Key SQL: Top Denial Codes

```sql
WITH denial_events AS (
  SELECT
    cp.claim_id,
    unnest(cp.denial_codes) as denial_code,
    cp.paid_amount,
    c.location_id,
    c.provider_id,
    c.payer,
    c.date_of_service
  FROM claim_payments cp
  JOIN claims c ON c.id = cp.claim_id
  WHERE cp.is_denial = true
    AND c.date_of_service >= $dateFrom
    AND c.date_of_service <= $dateTo
)
SELECT
  de.denial_code as code,
  COALESCE(dc.code_type, 'CARC') as code_type,
  COALESCE(dc.description, 'Unknown') as description,
  COALESCE(dc.category, 'Uncategorized') as category,
  COUNT(DISTINCT de.claim_id) as claim_count,
  COUNT(*) as occurrence_count
FROM denial_events de
LEFT JOIN denial_codes dc ON dc.code = de.denial_code
GROUP BY de.denial_code, dc.code_type, dc.description, dc.category
ORDER BY claim_count DESC
LIMIT 20
```

### Key SQL: Provider Denial Hotspots

```sql
WITH provider_stats AS (
  SELECT
    c.provider_id,
    u.name as provider_name,
    COUNT(DISTINCT c.id) as total_claims,
    COUNT(DISTINCT CASE WHEN cp.is_denial THEN c.id END) as denied_claims
  FROM claims c
  JOIN users u ON u.id = c.provider_id
  LEFT JOIN claim_payments cp ON cp.claim_id = c.id
  WHERE c.date_of_service >= $dateFrom
    AND c.provider_id IS NOT NULL
  GROUP BY c.provider_id, u.name
),
avg_rate AS (
  SELECT AVG(denied_claims::float / NULLIF(total_claims, 0)) as avg_denial_rate
  FROM provider_stats
  WHERE total_claims >= 10
)
SELECT
  ps.*,
  ROUND(ps.denied_claims::numeric / NULLIF(ps.total_claims, 0) * 100, 1) as denial_rate,
  ar.avg_denial_rate,
  CASE WHEN ps.denied_claims::float / NULLIF(ps.total_claims, 0) > ar.avg_denial_rate * 2
    THEN true ELSE false END as is_outlier
FROM provider_stats ps
CROSS JOIN avg_rate ar
WHERE ps.total_claims >= 5
ORDER BY denial_rate DESC
```

### Key SQL: Denial Trend (Monthly)

```sql
SELECT
  DATE_TRUNC('month', c.date_of_service)::date as period,
  COUNT(DISTINCT c.id) as total_claims,
  COUNT(DISTINCT CASE WHEN cp.is_denial THEN c.id END) as denied_claims,
  ROUND(
    COUNT(DISTINCT CASE WHEN cp.is_denial THEN c.id END)::numeric /
    NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1
  ) as denial_rate
FROM claims c
LEFT JOIN claim_payments cp ON cp.claim_id = c.id
WHERE c.date_of_service >= $dateFrom
GROUP BY DATE_TRUNC('month', c.date_of_service)
ORDER BY period ASC
```

### Denial Code Lookup CRUD

```typescript
// getDenialCodeLookup() -- all codes
// upsertDenialCode(data) -- insert or update by code+codeType
// bulkUpsertDenialCodes(rows) -- seed/import
```

## API Routes

Add to `server/routes/revenue-recovery.ts` (or split into `server/routes/revenue-recovery-denials.ts` if the file exceeds 200 lines).

### Endpoints

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/revenue-recovery/denials/summary` | OWNER,DIRECTOR,ANALYST | Aggregate denial stats |
| GET | `/api/revenue-recovery/denials/by-code` | OWNER,DIRECTOR,ANALYST | Top denial codes ranked |
| GET | `/api/revenue-recovery/denials/by-provider` | OWNER,DIRECTOR,ANALYST | Provider denial rates + outliers |
| GET | `/api/revenue-recovery/denials/by-location` | OWNER,DIRECTOR,ANALYST | Location-level denial breakdown |
| GET | `/api/revenue-recovery/denials/by-payer` | OWNER,DIRECTOR,ANALYST | Payer-level denial breakdown |
| GET | `/api/revenue-recovery/denials/trend` | OWNER,DIRECTOR,ANALYST | Time-series denial rate |
| GET | `/api/revenue-recovery/denial-codes` | OWNER,DIRECTOR,ANALYST | Denial code lookup table |
| POST | `/api/revenue-recovery/denial-codes` | OWNER | Create/update denial code |

### Query Parameters

```
?locationId=...&providerId=...&payer=...&dateFrom=...&dateTo=...&groupBy=month|week
```

### Response: Denial Summary

```json
{
  "totalClaims": 1240,
  "deniedClaims": 124,
  "denialRate": 10.0,
  "totalDeniedAmount": 18600,
  "topDenialCodes": [
    { "code": "CO-4", "description": "Service not consistent with procedure code", "count": 34 },
    { "code": "CO-16", "description": "Claim lacks information", "count": 28 },
    { "code": "PR-1", "description": "Deductible amount", "count": 22 }
  ]
}
```

### Response: Provider Outlier

```json
{
  "providerId": "uuid",
  "providerName": "Dr. Smith",
  "totalClaims": 85,
  "deniedClaims": 17,
  "denialRate": 20.0,
  "avgDenialRate": 8.5,
  "isOutlier": true,
  "topCodes": [
    { "code": "CO-4", "count": 8 },
    { "code": "CO-16", "count": 5 }
  ]
}
```

## Implementation Steps

1. Add denial aggregation functions to storage layer
2. Add denial code lookup CRUD to storage
3. Add API endpoints to route file
4. Ensure all queries support optional location/provider/payer/date filters
5. Run `npm run check`

## Related Code Files
- **Modify:** `server/storage-revenue-recovery.ts` (or create `server/storage-denial-intelligence.ts`)
- **Modify:** `server/routes/revenue-recovery.ts`

## Todo List
- [ ] Implement getDenialSummary
- [ ] Implement getDenialsByCode with CARC/RARC join
- [ ] Implement getDenialsByProvider with outlier detection
- [ ] Implement getDenialsByLocation
- [ ] Implement getDenialsByPayer
- [ ] Implement getDenialTrend (monthly/weekly)
- [ ] Implement denial code lookup CRUD
- [ ] Wire up all API endpoints
- [ ] Verify `npm run check` passes

## Success Criteria
- [ ] Top denial codes ranked correctly
- [ ] Provider outliers flagged when denial rate > 2x average
- [ ] Time-series trend shows monthly denial rate progression
- [ ] All dimensions filterable (location, provider, payer, date range)

## Risk Assessment
- **JSONB array unnesting:** PostgreSQL `unnest()` on JSONB arrays may need explicit cast; test with `jsonb_array_elements_text(denial_codes)`
- **Small sample sizes:** Provider outlier detection needs minimum claim threshold (default: 5 claims) to avoid false positives
- **Denial code seeding:** Initial deployment needs CARC code seed data; plan CSV import in Phase 06 or hardcode top 50 common codes
