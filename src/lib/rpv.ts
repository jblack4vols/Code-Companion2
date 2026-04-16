// src/lib/rpv.ts
// Server-side data access and metric computation for RPV Analytics.
// All functions are server-only — never import in a Client Component.

import { supabase } from '@/lib/supabase'
import type {
  RpvByLocation,
  RpvLocationWithMetrics,
  RpvSummaryStats,
  RpvStatus,
} from '@/types/rpv'
import { RPV_TARGET, RPV_NEAR_TARGET_MIN } from '@/types/rpv'

// ---------------------------------------------------------------------------
// deriveStatus
// Maps an RPV value to a traffic-light status per the CLAUDE.md alert rules:
//   🔴 critical   < $90
//   🟡 near_target $90–$94.99
//   🟢 on_target   ≥ $95
// ---------------------------------------------------------------------------
function deriveStatus(rpv: number): RpvStatus {
  if (rpv >= RPV_TARGET) return 'on_target'
  if (rpv >= RPV_NEAR_TARGET_MIN) return 'near_target'
  return 'critical'
}

// ---------------------------------------------------------------------------
// computeMetrics
// Adds all derived fields to a raw RpvByLocation row.
// ---------------------------------------------------------------------------
function computeMetrics(row: RpvByLocation): RpvLocationWithMetrics {
  const gap_to_target = +(row.rpv_actual - RPV_TARGET).toFixed(2)
  const gap_to_contracted =
    row.rpv_contracted != null
      ? +(row.rpv_actual - row.rpv_contracted).toFixed(2)
      : null

  // Monthly gap in dollars — how much revenue is being left on the table
  // at current visit volume if RPV were at the $95 target.
  // Negative = below target (leaking revenue). Positive = above target.
  const monthly_gap_dollars = +(gap_to_target * row.visits).toFixed(2)

  const est_monthly_revenue = +(row.rpv_actual * row.visits).toFixed(2)

  // Tier A = BCBS + Medicare (highest reimbursement payers)
  const tier_a_pct = +(row.payer_bcbs_pct + row.payer_medicare_pct).toFixed(1)

  // Tier C = Medicaid + self-pay (lowest reimbursement, biggest RPV drag)
  const tier_c_pct = +(row.payer_medicaid_pct + row.payer_selfpay_pct).toFixed(1)

  return {
    ...row,
    status: deriveStatus(row.rpv_actual),
    gap_to_target,
    gap_to_contracted,
    monthly_gap_dollars,
    est_monthly_revenue,
    tier_a_pct,
    tier_c_pct,
  }
}

// ---------------------------------------------------------------------------
// fetchRpvByLocation
// Returns all location RPV rows for the most recent period, with computed
// metrics. Sorted by rpv_actual descending by default.
// ---------------------------------------------------------------------------
export async function fetchRpvByLocation(): Promise<RpvLocationWithMetrics[]> {
  // Get the most recent period_start to ensure we're showing current data
  const { data: latestPeriod, error: periodError } = await supabase
    .from('rpv_by_location')
    .select('period_start')
    .order('period_start', { ascending: false })
    .limit(1)
    .single()

  if (periodError || !latestPeriod) {
    console.error('[fetchRpvByLocation] Could not determine latest period:', periodError?.message)
    throw new Error('Failed to determine current reporting period')
  }

  const { data, error } = await supabase
    .from('rpv_by_location')
    .select('*')
    .eq('period_start', latestPeriod.period_start)
    .order('rpv_actual', { ascending: false })

  if (error) {
    console.error('[fetchRpvByLocation] Supabase error:', error.message)
    throw new Error('Failed to load RPV data')
  }

  return (data as RpvByLocation[]).map(computeMetrics)
}

// ---------------------------------------------------------------------------
// fetchRpvSummaryStats
// Computes system-wide summary stats from the latest period data.
// ---------------------------------------------------------------------------
export async function fetchRpvSummaryStats(): Promise<RpvSummaryStats> {
  const locations = await fetchRpvByLocation()

  if (locations.length === 0) {
    return {
      system_rpv: 0,
      system_rpv_target: RPV_TARGET,
      total_monthly_gap: 0,
      total_visits: 0,
      locations_at_target: 0,
      locations_near_target: 0,
      locations_critical: 0,
      total_locations: 0,
    }
  }

  const total_visits = locations.reduce((sum, l) => sum + l.visits, 0)

  // Weighted average RPV — weight each location by its visit volume
  const weighted_rpv_sum = locations.reduce((sum, l) => sum + l.rpv_actual * l.visits, 0)
  const system_rpv = +(weighted_rpv_sum / total_visits).toFixed(2)

  // Total monthly revenue gap vs the $95 target
  const total_monthly_gap = +locations
    .reduce((sum, l) => sum + l.monthly_gap_dollars, 0)
    .toFixed(2)

  return {
    system_rpv,
    system_rpv_target: RPV_TARGET,
    total_monthly_gap,
    total_visits,
    locations_at_target: locations.filter((l) => l.status === 'on_target').length,
    locations_near_target: locations.filter((l) => l.status === 'near_target').length,
    locations_critical: locations.filter((l) => l.status === 'critical').length,
    total_locations: locations.length,
  }
}

// ---------------------------------------------------------------------------
// fetchRpvTrend (future use)
// Returns RPV history for a single location across the last N periods.
// Useful for a per-location detail/drill-down page.
// ---------------------------------------------------------------------------
export async function fetchRpvTrend(
  location: string,
  periods = 6
): Promise<RpvLocationWithMetrics[]> {
  const { data, error } = await supabase
    .from('rpv_by_location')
    .select('*')
    .eq('location', location)
    .order('period_start', { ascending: false })
    .limit(periods)

  if (error) {
    console.error('[fetchRpvTrend] Supabase error:', error.message)
    throw new Error(`Failed to load RPV trend for ${location}`)
  }

  return (data as RpvByLocation[])
    .map(computeMetrics)
    .reverse() // chronological order for charts
}
