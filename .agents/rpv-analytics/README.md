# RPV Analytics by Location
## crm.tristarpt.com — `/rpv`

Full-stack Next.js + Supabase implementation of the RPV Analytics dashboard.
Shows every clinic's revenue per visit vs the $95 target with payer mix breakdown.

---

## File structure

```
src/
  app/
    rpv/
      page.tsx                          ← Server Component entry point
  components/
    features/
      rpv/
        RpvStatCard.tsx                 ← Summary metric card
        RpvBarChart.tsx                 ← Horizontal bar chart (Server Component)
        PayerMixTable.tsx               ← Payer mix breakdown table (Server Component)
        RpvSortControls.tsx             ← Sort dropdown wrapper (Client Component)
        RpvSkeletons.tsx                ← Suspense loading skeletons
  lib/
    rpv.ts                              ← Server-side data fetching + metric logic
  types/
    rpv.ts                              ← Shared TypeScript interfaces + constants

supabase-schema.sql                     ← Run once in Supabase SQL Editor
```

---

## Setup

### 1. Run the Supabase schema

Open Supabase → SQL Editor → select project `tkgygnninsbzzwlobtff` → paste and
run `supabase-schema.sql`. This creates the `rpv_by_location` table, indexes,
RLS policies, and seeds YTD 2026 data for all 8 locations.

### 2. Environment variables

These should already be set in Railway from the referral dashboard setup:
```
NEXT_PUBLIC_SUPABASE_URL=https://tkgygnninsbzzwlobtff.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

### 3. Install dependencies (if not already present)

```bash
npm install @supabase/supabase-js
npx shadcn-ui@latest add table select badge skeleton
```

### 4. Copy files into your CRM repo

```bash
xcopy "referral-intelligence\src\app\rpv" "Code-Companion3\src\app\rpv" /E /I /Y
xcopy "referral-intelligence\src\components\features\rpv" "Code-Companion3\src\components\features\rpv" /E /I /Y
copy "referral-intelligence\src\lib\rpv.ts" "Code-Companion3\src\lib\"
copy "referral-intelligence\src\types\rpv.ts" "Code-Companion3\src\types\"
```

### 5. Add to nav and deploy

Add `/rpv` to your sidebar nav, then:
```bash
git add .
git commit -m "feat: RPV analytics by location dashboard"
git push
```

---

## Business logic

### RPV status thresholds (from CLAUDE.md alert rules)
| Status | Range | Color |
|---|---|---|
| On target | ≥ $95 | Green |
| Near target | $90–$94.99 | Amber |
| Critical | < $90 | Red |

### Monthly gap calculation
```
monthly_gap_dollars = (rpv_actual - 95) × visits
```
Negative = revenue being left on the table vs target.
Example: Johnson City at $85.40 RPV × 450 visits = –$4,320/mo gap.

### Weighted system RPV
```
system_rpv = Σ(rpv_actual × visits) / Σ(visits)
```
Weighted by volume so high-visit locations drive the number correctly.

### Tier A % (payer mix quality indicator)
```
tier_a_pct = payer_bcbs_pct + payer_medicare_pct
```
Higher Tier A % = better RPV. Bean Station and Johnson City flag red
because their Medicaid mix exceeds 35% — the primary RPV drag.

---

## Keeping data current

The `rpv_by_location` table needs monthly updates from your Prompt EMR exports.
Options in order of preference:

1. **`prompt-emr-ingestion` skill** — automates this via scheduled Outlook email
   parsing. Run `/prompt-emr-ingestion` in claude.ai to set it up.

2. **Manual upsert** — export the Visits Revenue Report from Prompt EMR,
   calculate RPV per location, and insert rows via the Supabase dashboard.

3. **Future**: Metabase → Supabase pipeline using the `platform-expert` skill.

---

## Extending this screen

| Feature | Where to add |
|---|---|
| Per-location drill-down | `/rpv/[location]` dynamic route — use `fetchRpvTrend()` |
| Payer contract modeler | Link to `/payer-contracts` — use `payer-contract-analyzer` skill |
| YoY RPV comparison | Add `period` selector to `RpvSortControls`, store prior year in same table |
| RPV target override | Read from `profit_optimizer_benchmarks` table instead of constant |
