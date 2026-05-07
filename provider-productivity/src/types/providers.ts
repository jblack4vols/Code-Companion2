// src/types/providers.ts
// Shared TypeScript interfaces for the Provider Productivity feature.
// Keep in sync with provider_weekly_stats and provider_cpt_utilization schemas.

// KPI thresholds — from CLAUDE.md benchmarks
export const VPD_TARGET = 10          // visits per provider per day
export const UPV_TARGET = 4.0         // units per visit
export const VPC_TARGET = 8           // visits per case (episode completion)
export const RPV_TARGET = 95          // revenue per visit ($)

// Status thresholds
export const VPD_NEAR_MIN = 8         // amber zone lower bound
export const UPV_NEAR_MIN = 3.5       // amber zone lower bound

export type ProviderRole = 'PT' | 'PTA' | 'OT' | 'OTA'
export type ProviderStatus = 'on_target' | 'near_target' | 'needs_coaching'
export type RootCause =
  | 'scheduling_fill_rate'
  | 'cpt_undercapture'
  | 'rushing_missing_units'
  | 'engagement_caseload'
  | 'both_kpis_low'
  | 'visits_per_case_low'

// Raw row from provider_weekly_stats
export interface ProviderWeeklyStats {
  id: string
  provider_name: string
  provider_role: ProviderRole
  location: string
  week_start: string          // ISO date (Monday)
  days_worked: number
  total_visits: number
  visits_per_day: number
  total_units: number
  units_per_visit: number
  visits_per_case: number | null
  weekly_revenue: number | null
  active: boolean
  created_at: string
  updated_at: string
}

// CPT utilization row
export interface ProviderCptUtilization {
  id: string
  provider_name: string
  location: string
  week_start: string
  cpt_code: string
  unit_count: number
  pct_of_total: number
  location_peer_pct: number | null
}

// CPT row with derived delta
export interface CptWithDelta extends ProviderCptUtilization {
  peer_delta: number          // pct_of_total - location_peer_pct
  is_underutilized: boolean   // peer_delta < -2 (meaningfully below peers)
}

// 4-week trend array — index 0 = oldest, index 3 = most recent
export interface ProviderTrend {
  vpd: [number, number, number, number]
  upv: [number, number, number, number]
  weeks: [string, string, string, string]  // ISO date strings
}

// Full provider record with all derived fields
export interface ProviderWithMetrics {
  provider_name: string
  provider_role: ProviderRole
  location: string
  is_support_role: boolean          // PTA or OTA
  // Current week (most recent)
  vpd_current: number
  upv_current: number
  vpc_current: number | null
  days_worked: number
  weekly_visits: number
  weekly_revenue: number
  weekly_rev_gap: number            // (vpd - VPD_TARGET) * days_worked * RPV
  // 4-week trend
  trend: ProviderTrend
  vpd_trend_direction: 'up' | 'down' | 'flat'
  // Status & coaching
  status: ProviderStatus
  root_cause: RootCause | null      // null if on_target
  coaching_notes: string[]          // human-readable coaching bullets
  cpt_utilization: CptWithDelta[]   // empty for on_target providers
}

// Location-level rollup
export interface LocationRollup {
  location: string
  provider_count: number
  flagged_count: number
  avg_vpd: number
  avg_upv: number
  avg_vpc: number
  status: ProviderStatus            // worst status among providers
  providers: ProviderWithMetrics[]
}

// Dashboard summary
export interface ProviderSummaryStats {
  avg_vpd: number
  avg_upv: number
  avg_vpc: number
  providers_at_target: number
  total_providers: number
  total_weekly_rev_gap: number      // sum of all gap dollars (negative = below target)
  flagged_provider_count: number
}
