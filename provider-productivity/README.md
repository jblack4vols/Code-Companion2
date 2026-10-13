# Provider Productivity v2
## crm.tristarpt.com — `/providers`

Full-stack Next.js + Supabase implementation of the improved Provider
Productivity dashboard with location rollups, 4-week trends, PT/PTA role
split, root cause classification, and CPT coaching rows.

---

## File structure

```
src/
  app/
    providers/
      page.tsx                              ← Server Component entry point
  components/
    features/
      providers/
        ProviderMiniCharts.tsx              ← SparkTrend + MiniKpiBar (Server)
        CptUtilizationGrid.tsx              ← CPT breakdown grid (Server)
        ProviderRow.tsx                     ← Single provider row + coaching (Server)
        LocationAccordion.tsx              ← Expandable location sections (Client)
        ProviderComponents.tsx             ← ProviderStatCard + Skeletons
  lib/
    providers.ts                            ← Data fetching + metric computation
  types/
    providers.ts                            ← Interfaces + KPI constants

supabase-schema.sql                         ← Run once in Supabase SQL Editor
```

---

## Setup

### 1. Run the Supabase schema

Open Supabase → SQL Editor → select project `tkgygnninsbzzwlobtff` → paste and
run `supabase-schema.sql`. Creates two tables:
- `provider_weekly_stats` — one row per provider per week
- `provider_cpt_utilization` — CPT breakdown per provider per week

Seeds 4 weeks of data for all 22 providers and CPT data for flagged providers.

### 2. Environment variables

Already set from prior dashboards:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### 3. Install dependencies

```bash
npx shadcn-ui@latest add table select skeleton
```

### 4. Copy files

```bash
xcopy "provider-productivity\src" "Code-Companion3\src" /E /I /Y
```

### 5. Deploy

```bash
git add .
git commit -m "feat: provider productivity v2 dashboard"
git push
```

---

## Business logic

### Status thresholds
| Status | Condition | Color |
|---|---|---|
| On target | VPD ≥ 10 AND UPV ≥ 4.0 | Green |
| Near target | VPD ≥ 8 AND UPV ≥ 3.5 | Amber |
| Needs coaching | Either below near-target floor | Red |

### Root cause classification
| Root cause | Pattern |
|---|---|
| Scheduling / fill-rate | Low VPD, normal UPV — not a provider behavior issue |
| CPT undercapture | Near-target VPD, low UPV — documentation coaching |
| Rushing — missing units | High VPD, low UPV — too fast, not capturing units |
| Engagement / caseload | Both KPIs low — director conversation needed |
| Low visits per case | VPC < 8 + low VPD — early discharge / POC compliance |

### CPT peer delta
`peer_delta = provider_pct_of_total - location_peer_pct`
- `peer_delta < -2` → `is_underutilized = true` → shown in red
- `peer_delta > +2` → shown in green (over-indexed, may warrant review)

### Weekly revenue gap
```
weekly_rev_gap = (vpd_current - VPD_TARGET) * days_worked * RPV_TARGET
```
Negative = revenue left on table. Summed across all flagged providers for
the recovery banner.

### PT/PTA support role distinction
PTAs and OTAs are flagged with a blue "Support" badge. Their benchmarks
should eventually be adjusted (target VPD may be 8–9 for PTAs vs 10 for PTs).
This is a future enhancement — current thresholds apply equally.

---

## Keeping data current

`provider_weekly_stats` needs weekly updates from Prompt EMR exports.
Run `/prompt-emr-ingestion` in claude.ai to automate via scheduled email.
Manual upsert also works — the schema uses `ON CONFLICT DO UPDATE`.

CPT data (`provider_cpt_utilization`) comes from the CPT revenue analytics
Supabase project (`uignhceazgskozzczfyi`) — a future pipeline can sync
weekly CPT unit counts from the claims table.

---

## Extending this screen

| Feature | Approach |
|---|---|
| PTA-adjusted targets | Add `vpd_target` column to a `provider_config` table |
| New hire ramp flag | Add `hire_date` to provider config; compare vs ramp curve |
| Per-provider detail page | `/providers/[name]` — use `fetchRpvTrend` pattern |
| Director email digest | Weekly cron → send flagged list to clinic directors |
| Prompt EMR auto-sync | `prompt-emr-ingestion` skill + scheduled upsert |
