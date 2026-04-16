# Referral Intelligence

Load payer tier logic, gone-dark rules, and referral business rules before coding referral features.

## Payer Tiers
- **Commercial** — highest value, target mix >40%
- **Medicare** — moderate value, steady volume
- **Medicaid** — lower reimbursement
- **Workers Comp** — high per-visit but variable volume
- **Auto/PI** — highest per-visit, lowest volume

## Physician Relationship Stages (auto-calculated by nightly ETL)
- **NEW** — no referrals yet, recently added
- **ACTIVE** — has recent referrals (last 90 days)
- **AT_RISK** — had referrals 91-180 days ago but none in last 90 days
- **INACTIVE** — no referrals in 180+ days (gone dark)

## Stage Transition Logic (`server/etl-data-enrichment.ts`)
- Recent referrals (0-90 days) → ACTIVE
- Mid-range only (91-180 days, none recent) → AT_RISK
- No referrals in 180+ days → INACTIVE
- New physician with no referrals → NEW

## Tiering Score (`server/etl-summary-generation.ts`)
Weighted composite: `(revenueWeight * revNorm) + (trendWeight * trendNorm) + (conversionWeight * arrivalRate) + (payerMixWeight * commercialMixPct)`
- Default weights: revenue 0.4, trend 0.2, conversion 0.2, payerMix 0.2
- Tier A: score >= 70, Tier B: 40-69, Tier C: <40

## At-Risk Detection (`server/routes/features.ts`)
- Providers with declining referral counts month-over-month
- Risk score: `(dependencyRatio * 0.6) + (declining ? 0.4 : 0)`

## Health Score Components
- Referral volume (0-25 pts)
- Interaction frequency (0-25 pts)
- Conversion rate: >=70% → 25pts, >=50% → 15pts, >=30% → 10pts
- Trend direction (0-25 pts)

## Key Tables
- `physicians` — provider records with `relationshipStage`, `tierScore`
- `referrals` — patient referrals with `physicianId`, `locationId`, `status`
- `physician_monthly_summary` — aggregated monthly stats per provider
- `physician_stage_history` — stage change audit trail

## Task
When coding referral features for: $ARGUMENTS
1. Read `server/etl-data-enrichment.ts` and `server/etl-summary-generation.ts` for business logic
2. Use the stage/tier constants above
3. Ensure location scoping via `getUserLocationScope()`
4. Filter by `deletedAt IS NULL` for soft-deleted records
