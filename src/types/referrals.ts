// src/types/referrals.ts
// Shared TypeScript interfaces for the Referral Intelligence feature.
// Keep in sync with the referral_sources Supabase table schema.

export type PayerTier = 'A' | 'B' | 'C'

export interface ReferralSource {
  id: string
  physician_name: string
  npi: string | null
  specialty: string | null
  practice: string | null
  location: string | null
  payer_tier: PayerTier
  cases_ytd: number
  cases_prior_year: number
  avg_visits_per_case: number
  last_referral_date: string | null  // ISO date string
  gone_dark: boolean
  gone_dark_since: string | null     // ISO date string
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// Derived/computed fields added on the server before passing to components
export interface ReferralSourceWithMetrics extends ReferralSource {
  yoy_delta: number          // cases_ytd - cases_prior_year
  est_revenue_ytd: number    // cases_ytd * avg_visits_per_case * RPV_TARGET
  roi_score: number          // 0–100 composite score
  days_since_referral: number | null
}

// Dashboard-level summary stats
export interface ReferralSummaryStats {
  active_referrers: number
  cases_ytd: number
  cases_prior_year: number
  yoy_pct: number
  tier_a_pct: number           // % of cases from Tier A sources
  tier_a_pct_prior_year: number
  gone_dark_count: number
}

// Filter state used by the client-side filter controls
export interface ReferralFilters {
  location: string    // 'all' or a specific location name
  tier: string        // 'all' | 'A' | 'B' | 'C'
  sort: ReferralSortKey
}

export type ReferralSortKey = 'roi_score' | 'cases_ytd' | 'est_revenue_ytd' | 'yoy_delta'
