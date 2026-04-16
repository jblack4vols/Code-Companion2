// src/types/rpv.ts
// Shared TypeScript interfaces for RPV Analytics by Location.
// Keep in sync with the rpv_by_location Supabase table schema.

// RPV status thresholds — mirrors the alert rules in CLAUDE.md
export const RPV_TARGET = 95
export const RPV_NEAR_TARGET_MIN = 90   // amber zone: $90–$94.99
export const RPV_CRITICAL_MAX = 90      // red zone: < $90

export type RpvStatus = 'on_target' | 'near_target' | 'critical'

export interface RpvByLocation {
  id: string
  location: string
  period_start: string   // ISO date
  period_end: string     // ISO date
  rpv_actual: number
  rpv_contracted: number | null
  visits: number
  total_collected: number | null
  payer_bcbs_pct: number
  payer_medicare_pct: number
  payer_commercial_pct: number
  payer_medicaid_pct: number
  payer_selfpay_pct: number
  payer_wc_pct: number
  payer_va_pct: number
  created_at: string
  updated_at: string
}

// Derived fields added server-side before passing to components
export interface RpvLocationWithMetrics extends RpvByLocation {
  status: RpvStatus
  gap_to_target: number          // rpv_actual - RPV_TARGET (negative = below)
  gap_to_contracted: number | null
  monthly_gap_dollars: number    // gap_to_target * visits (annualized to monthly)
  est_monthly_revenue: number    // rpv_actual * visits
  tier_a_pct: number             // bcbs + medicare (highest reimbursement)
  tier_c_pct: number             // medicaid + self-pay (lowest reimbursement)
}

// Dashboard-level summary across all locations
export interface RpvSummaryStats {
  system_rpv: number             // weighted average across all locations
  system_rpv_target: number      // always RPV_TARGET constant
  total_monthly_gap: number      // sum of monthly_gap_dollars across locations
  total_visits: number
  locations_at_target: number
  locations_near_target: number
  locations_critical: number
  total_locations: number
}

export type RpvSortKey = 'rpv_actual' | 'gap_to_target' | 'visits' | 'monthly_gap_dollars'
