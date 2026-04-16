---
name: ops-kpis
description: Load the 10 KPI alert rules and benchmark targets for ops dashboard features
---

Before coding any ops dashboard, alert system, or KPI feature, internalize these rules:

**Tristar PT KPI Benchmarks (read from `profit_optimizer_benchmarks` Supabase table — never hardcode):**
- RPV target: $95 | Current: ~$92
- CPV target: $92
- Labor cost ratio target: 65% | Current: ~70.6%
- Arrival rate target: 85%
- Units per visit (UPV) target: 4.0
- Visits per provider per day: ≥ 10
- Monthly system-wide visits: ~5,600

**10 Alert Rules (surface these in any dashboard/alert component):**
1. 🔴 RPV < $90 at any location → "Revenue per visit critical"
2. 🟡 RPV $90–$94 at any location → "RPV below target"
3. 🔴 Labor ratio > 72% at any location → "Labor cost critical"
4. 🟡 Labor ratio 65–72% → "Labor ratio elevated"
5. 🔴 Arrival rate < 78% at any location → "No-show rate critical"
6. 🟡 Arrival rate 78–84% → "Arrival rate below target"
7. 🔴 Visits/provider/day < 8 → "Provider productivity low"
8. 🟡 UPV < 3.5 → "Units per visit below target"
9. 🔴 Bean Station conversion < 65% → "Bean Station conversion alert"
10. 🔴 Johnson City visits/case < 7 → "Johnson City case completion alert"

**Alert display rules:**
- 🔴 Red = immediately actionable, show at top of dashboard
- 🟡 Yellow = monitor, show in secondary alert section
- Use shadcn Alert component — never raw divs
- Always link to the relevant detail view from the alert

**Color coding for tables:**
- At/above target: `text-green-600`
- Within 10% of target: `text-amber-500`
- More than 10% below target: `text-red-600`

Now implement the feature described in $ARGUMENTS using these rules.
