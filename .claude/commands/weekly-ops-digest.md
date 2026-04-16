Generate a weekly operations digest for Tristar PT by querying the live CRM.

Pull data from these endpoints (use curl against the running server or read the database directly):
1. `/api/referral-intelligence/summary` — active referrers, cases YTD, YoY %, gone-dark count
2. `/api/dashboard/kpis` or equivalent — RPV by location, arrival rate, labor ratio
3. `/api/referral-intelligence/gone-dark` — list providers who have gone dark
4. `/api/provider-productivity` — visits/day, UPV by provider

Format as a concise report:
- **Headline KPIs** — RPV, arrival rate, labor ratio vs targets ($95, 85%, 65%)
- **Referral Health** — active referrers, cases YTD, YoY trend, gone-dark count + names
- **Location Alerts** — any location with RPV < $90 or arrival < 78%
- **Provider Flags** — any provider under 8 visits/day or UPV < 3.5
- **Action Items** — top 3 things to address this week

Keep it under 40 lines. No fluff. Data-driven.
