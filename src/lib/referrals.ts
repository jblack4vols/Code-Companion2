// src/lib/referrals.ts
// Server-side data access functions for the Referral Intelligence dashboard.
// All functions run on the server — never import this in a Client Component.

import { supabase } from '@/lib/supabase'
import type {
  ReferralSource,
  ReferralSourceWithMetrics,
  ReferralSummaryStats,
} from '@/types/referrals'

// Business constants — read from Supabase profit_optimizer_benchmarks in a
// full implementation; hardcoded here as a safe fallback per CLAUDE.md guidance.
const RPV_TARGET = 95

// Tier multipliers used in the ROI score formula.
// Tier A = highest reimbursement (BCBS/Medicare), Tier C = lowest (Medicaid/self-pay).
const TIER_MULTIPLIER: Record<string, number> = {
  A: 1.0,
  B: 0.85,
  C: 0.60,
}

// ---------------------------------------------------------------------------
// computeMetrics
// Adds derived fields to a raw ReferralSource row.
// ---------------------------------------------------------------------------
function computeMetrics(source: ReferralSource): ReferralSourceWithMetrics {
  const multiplier = TIER_MULTIPLIER[source.payer_tier] ?? 0.85
  const est_revenue_ytd = source.cases_ytd * source.avg_visits_per_case * RPV_TARGET
  const yoy_delta = source.cases_ytd - source.cases_prior_year

  // ROI score: volume × avg visits × tier multiplier, normalized 0–100.
  // Max realistic score anchored at ~40 cases × 10 visits × 1.0 multiplier = 400.
  const raw_roi = source.cases_ytd * source.avg_visits_per_case * multiplier
  const roi_score = Math.min(100, Math.round((raw_roi / 400) * 100))

  // Days since last referral — null if no referral date recorded.
  let days_since_referral: number | null = null
  if (source.last_referral_date) {
    const lastDate = new Date(source.last_referral_date)
    const today = new Date()
    days_since_referral = Math.floor(
      (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    )
  }

  return {
    ...source,
    yoy_delta,
    est_revenue_ytd,
    roi_score,
    days_since_referral,
  }
}

// ---------------------------------------------------------------------------
// fetchReferralSources
// Returns all active referral sources with computed metrics, sorted by ROI.
// ---------------------------------------------------------------------------
export async function fetchReferralSources(): Promise<ReferralSourceWithMetrics[]> {
  const { data, error } = await supabase
    .from('referral_sources')
    .select('*')
    .eq('active', true)        // Never show David Caldwell PA or other removed sources
    .order('cases_ytd', { ascending: false })

  if (error) {
    console.error('[fetchReferralSources] Supabase error:', error.message)
    throw new Error('Failed to load referral sources')
  }

  const sources = (data as ReferralSource[]).map(computeMetrics)

  // Sort by ROI score descending — gone-dark sources float to a separate section
  return sources.sort((a, b) => b.roi_score - a.roi_score)
}

// ---------------------------------------------------------------------------
// fetchGoneDarkSources
// Returns only gone-dark active sources, ordered by days_since_referral desc.
// A source is gone dark if gone_dark = true AND active = true.
// ---------------------------------------------------------------------------
export async function fetchGoneDarkSources(): Promise<ReferralSourceWithMetrics[]> {
  const { data, error } = await supabase
    .from('referral_sources')
    .select('*')
    .eq('active', true)
    .eq('gone_dark', true)
    .order('last_referral_date', { ascending: true }) // oldest last referral first

  if (error) {
    console.error('[fetchGoneDarkSources] Supabase error:', error.message)
    throw new Error('Failed to load gone-dark sources')
  }

  return (data as ReferralSource[]).map(computeMetrics)
}

// ---------------------------------------------------------------------------
// fetchReferralSummaryStats
// Computes dashboard-level aggregate stats in a single query pass.
// ---------------------------------------------------------------------------
export async function fetchReferralSummaryStats(): Promise<ReferralSummaryStats> {
  const { data, error } = await supabase
    .from('referral_sources')
    .select('payer_tier, cases_ytd, cases_prior_year, gone_dark')
    .eq('active', true)

  if (error) {
    console.error('[fetchReferralSummaryStats] Supabase error:', error.message)
    throw new Error('Failed to load referral stats')
  }

  const rows = data as Pick<
    ReferralSource,
    'payer_tier' | 'cases_ytd' | 'cases_prior_year' | 'gone_dark'
  >[]

  const activeReferrers = rows.filter((r) => !r.gone_dark && r.cases_ytd > 0).length
  const totalCasesYtd = rows.reduce((sum, r) => sum + r.cases_ytd, 0)
  const totalCasesPrior = rows.reduce((sum, r) => sum + r.cases_prior_year, 0)
  const yoyPct =
    totalCasesPrior > 0
      ? Math.round(((totalCasesYtd - totalCasesPrior) / totalCasesPrior) * 100)
      : 0

  // Tier A case share — current year vs prior year
  const tierACasesYtd = rows
    .filter((r) => r.payer_tier === 'A')
    .reduce((sum, r) => sum + r.cases_ytd, 0)
  const tierACasesPrior = rows
    .filter((r) => r.payer_tier === 'A')
    .reduce((sum, r) => sum + r.cases_prior_year, 0)

  const tierAPct =
    totalCasesYtd > 0 ? Math.round((tierACasesYtd / totalCasesYtd) * 100) : 0
  const tierAPctPrior =
    totalCasesPrior > 0 ? Math.round((tierACasesPrior / totalCasesPrior) * 100) : 0

  const goneDarkCount = rows.filter((r) => r.gone_dark).length

  return {
    active_referrers: activeReferrers,
    cases_ytd: totalCasesYtd,
    cases_prior_year: totalCasesPrior,
    yoy_pct: yoyPct,
    tier_a_pct: tierAPct,
    tier_a_pct_prior_year: tierAPctPrior,
    gone_dark_count: goneDarkCount,
  }
}
