---
name: referral-feature
description: Load referral intelligence business rules before coding any referral feature
---

Before writing any referral-related code, internalize these business rules for Tristar PT:

**Payer Tier Classification (used in all referral scoring):**
- Tier A: BCBS TN, Medicare/Palmetto GBA — highest reimbursement, prioritize
- Tier B: Commercial, Workers Comp, VA — mid-tier
- Tier C: Medicaid, Self-Pay — lowest reimbursement

**Gone-Dark Logic:**
- A referral source is "gone dark" if they have sent 0 cases in the past 60 days AND had ≥2 cases in the prior 60-day period
- Gone-dark sources should display a red badge and appear in a dedicated alert section
- Never silently drop gone-dark sources from lists — always surface them

**Top Referrers (pre-loaded context):**
- Angelo Sorce MD — NPI 1215968300 (Tier A, top priority)
- Sonya Sartain APRN (Tier A)
- Sadril Mohammad PA-S (Tier A)
- David Caldwell PA — PERMANENTLY REMOVED, left state. Never display or include in any list.

**Referral ROI Score formula:**
ROI Score = (avg_visits_per_case × RPV × case_count × payer_tier_multiplier) / marketing_effort_score
- Tier A multiplier: 1.0, Tier B: 0.85, Tier C: 0.60
- RPV target: $95

**Table schema (`referral_sources` in Supabase `tkgygnninsbzzwlobtff`):**
- `id`, `physician_name`, `npi`, `specialty`, `practice`, `payer_tier`, `cases_ytd`,
  `cases_prior_year`, `avg_visits_per_case`, `last_referral_date`, `gone_dark` (bool)

Now implement the feature described in $ARGUMENTS using these rules.
