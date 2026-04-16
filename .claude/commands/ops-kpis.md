# Ops KPIs & Alert Rules

Load the operational KPI definitions and alert thresholds before coding dashboard or analytics features.

## Unit Economics Alert Rules (`server/unit-economics-alert-engine.ts`)

### Location-Level Alerts
| Alert Type | Metric | Threshold | Direction | Action |
|---|---|---|---|---|
| LOW_REVENUE_PER_VISIT | Revenue / Visit | $95 | Below | Investigate payer mix |
| HIGH_COST_PER_VISIT | Cost / Visit | $92 | Above | Review staffing/overhead |
| HIGH_LABOR_PERCENT | Labor % of Revenue | 57.5% | Above | Audit provider productivity |

### Provider-Level Alerts
| Alert Type | Trigger | Action |
|---|---|---|
| declining | Referrals dropped month-over-month | Outreach immediately |
| reactivated | AT_RISK/INACTIVE → ACTIVE | Celebrate, maintain contact |

## Executive Dashboard KPIs (`server/routes/dashboard.ts`)
- **Total Referrals** — count for period with MoM growth %
- **Active Physicians** — providers with stage != INACTIVE
- **At-Risk Physicians** — stage = AT_RISK count
- **Avg Referrals/Provider** — total referrals / active physicians
- **Interaction Rate** — interactions logged / active physicians
- **Top Referrers** — ranked by referral volume
- **Geographic Distribution** — referrals by city
- **Correlation Analysis** — interaction frequency vs referral volume

## Billing Lag Alerts (`server/billing-lag-alert-engine.ts`)
- Claims >30 days unbilled
- Stale claims by payer type
- Denial rate spikes

## Tiering Weights (configurable via `/api/tiering-weights`)
- Revenue weight: 0.4 (default)
- Trend weight: 0.2
- Conversion weight: 0.2
- Payer mix weight: 0.2
- Tier A threshold: 70
- Tier B threshold: 40
- Tier C: below 40

## 8 Clinic Locations
Bean Station, Jefferson City, Johnson City, Maryville, Morristown, New Tazewell, Newport, Rogersville

## Task
When coding dashboards or KPI features for: $ARGUMENTS
1. Use the thresholds above — don't hardcode different values
2. Alerts go in `financial_alerts` table via `InsertFinancialAlert` schema
3. Dashboard queries must respect `getUserLocationScope()`
4. Chart colors: use `chart-1` through `chart-5` tokens
5. Show trend indicators with `TrendingUp`/`TrendingDown` icons from Lucide
