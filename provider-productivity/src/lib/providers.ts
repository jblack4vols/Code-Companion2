// src/lib/providers.ts
// Server-side data access and metric computation for Provider Productivity.
// All functions are server-only — never import in a Client Component.

import { supabase } from '@/lib/supabase'
import type {
  ProviderWeeklyStats,
  ProviderCptUtilization,
  ProviderWithMetrics,
  LocationRollup,
  ProviderSummaryStats,
  ProviderStatus,
  ProviderTrend,
  RootCause,
  CptWithDelta,
} from '@/types/providers'
import {
  VPD_TARGET,
  UPV_TARGET,
  VPC_TARGET,
  RPV_TARGET,
  VPD_NEAR_MIN,
  UPV_NEAR_MIN,
} from '@/types/providers'

// Ordered list of Tristar locations — controls display order
export const LOCATIONS = [
  'Morristown',
  'Maryville',
  'Jefferson City',
  'Newport',
  'Rogersville',
  'New Tazewell',
  'Bean Station',
  'Johnson City',
]

// ---------------------------------------------------------------------------
// deriveStatus — traffic-light status from current VPD + UPV
// ---------------------------------------------------------------------------
function deriveStatus(vpd: number, upv: number): ProviderStatus {
  if (vpd >= VPD_TARGET && upv >= UPV_TARGET) return 'on_target'
  if (vpd >= VPD_NEAR_MIN && upv >= UPV_NEAR_MIN) return 'near_target'
  return 'needs_coaching'
}

// ---------------------------------------------------------------------------
// deriveRootCause — classify WHY a provider is underperforming
// ---------------------------------------------------------------------------
function deriveRootCause(
  vpd: number,
  upv: number,
  vpc: number | null
): RootCause | null {
  if (vpd >= VPD_TARGET && upv >= UPV_TARGET) return null

  // Low VPD but UPV is fine → scheduling/fill-rate problem, not a provider issue
  if (vpd < VPD_TARGET && upv >= UPV_TARGET) return 'scheduling_fill_rate'

  // VPD near target but UPV low → billing/documentation behavior
  if (vpd >= VPD_NEAR_MIN && upv < UPV_TARGET) return 'cpt_undercapture'

  // High VPD but low UPV → rushing through visits, not capturing additional units
  if (vpd >= VPD_TARGET && upv < UPV_NEAR_MIN) return 'rushing_missing_units'

  // Low visits per case → discharge/completion issue (especially Johnson City)
  if (vpc !== null && vpc < VPC_TARGET && vpd < VPD_TARGET) return 'visits_per_case_low'

  // Both low → engagement or caseload structural issue
  return 'both_kpis_low'
}

// ---------------------------------------------------------------------------
// buildCoachingNotes — human-readable bullets for the coaching row
// ---------------------------------------------------------------------------
function buildCoachingNotes(
  vpd: number,
  upv: number,
  vpc: number | null,
  cpts: CptWithDelta[]
): string[] {
  const notes: string[] = []

  if (vpd < VPD_TARGET) {
    notes.push(
      `Visits/day ${vpd.toFixed(1)} vs ${VPD_TARGET} target — review schedule fill rate and cancellation recovery`
    )
  }
  if (upv < UPV_TARGET) {
    notes.push(
      `UPV ${upv.toFixed(1)} vs ${UPV_TARGET} target — check documentation for uncaptured timed codes`
    )
  }
  if (vpc !== null && vpc < VPC_TARGET) {
    notes.push(
      `Visits/case ${vpc.toFixed(1)} vs ${VPC_TARGET} target — review early discharge patterns and POC compliance`
    )
  }

  // Surface the most under-utilized CPT codes vs peers
  const underutilized = cpts
    .filter((c) => c.is_underutilized)
    .sort((a, b) => a.peer_delta - b.peer_delta)
    .slice(0, 2)

  if (underutilized.length > 0) {
    const codeList = underutilized
      .map((c) => `${c.cpt_code} (${c.pct_of_total}% vs peer ${c.location_peer_pct}%)`)
      .join(', ')
    notes.push(`Low CPT capture vs location peers: ${codeList}`)
  }

  return notes
}

// ---------------------------------------------------------------------------
// buildTrend — extract 4-week VPD/UPV arrays from sorted weekly rows
// ---------------------------------------------------------------------------
function buildTrend(rows: ProviderWeeklyStats[]): ProviderTrend {
  // rows must be sorted ascending by week_start, length >= 1
  const padded = [0, 0, 0, 0].map((_, i) => rows[rows.length - 4 + i] ?? rows[0])

  return {
    vpd: padded.map((r) => r?.visits_per_day ?? 0) as [number, number, number, number],
    upv: padded.map((r) => r?.units_per_visit ?? 0) as [number, number, number, number],
    weeks: padded.map((r) => r?.week_start ?? '') as [string, string, string, string],
  }
}

// ---------------------------------------------------------------------------
// fetchProviderData
// Returns all location rollups with per-provider metrics and CPT data.
// All data fetched in 3 parallel queries then assembled in JS.
// ---------------------------------------------------------------------------
export async function fetchProviderData(): Promise<LocationRollup[]> {
  // 1. Most recent 4 weeks of weekly stats (active providers only)
  const { data: statsData, error: statsError } = await supabase
    .from('provider_weekly_stats')
    .select('*')
    .eq('active', true)
    .order('week_start', { ascending: true })
    .limit(4 * 22) // 4 weeks × ~22 providers

  if (statsError) {
    console.error('[fetchProviderData] stats error:', statsError.message)
    throw new Error('Failed to load provider stats')
  }

  // 2. Most recent week's CPT utilization (flagged providers only in practice,
  //    but we fetch all and filter in JS)
  const latestWeek = (statsData as ProviderWeeklyStats[]).reduce(
    (max, r) => (r.week_start > max ? r.week_start : max),
    ''
  )

  const { data: cptData, error: cptError } = await supabase
    .from('provider_cpt_utilization')
    .select('*')
    .eq('week_start', latestWeek)

  if (cptError) {
    console.error('[fetchProviderData] CPT error:', cptError.message)
    // Non-fatal — continue without CPT data
  }

  const allStats = statsData as ProviderWeeklyStats[]
  const allCpts = (cptData ?? []) as ProviderCptUtilization[]

  // Group stats by provider key (name + location)
  const providerMap = new Map<string, ProviderWeeklyStats[]>()
  for (const row of allStats) {
    const key = `${row.provider_name}|${row.location}`
    if (!providerMap.has(key)) providerMap.set(key, [])
    providerMap.get(key)!.push(row)
  }

  // Build ProviderWithMetrics for each provider
  const providerMetrics: ProviderWithMetrics[] = []

  for (const [, rows] of providerMap) {
    // rows sorted ascending (oldest → newest)
    const current = rows[rows.length - 1]
    const trend = buildTrend(rows)
    const vpd = current.visits_per_day
    const upv = current.units_per_visit
    const vpc = current.visits_per_case

    const status = deriveStatus(vpd, upv)
    const rootCause = deriveRootCause(vpd, upv, vpc)

    // CPT data for this provider
    const providerCpts = allCpts
      .filter((c) => c.provider_name === current.provider_name && c.location === current.location)
      .map((c): CptWithDelta => ({
        ...c,
        location_peer_pct: c.location_peer_pct ?? 0,
        peer_delta: c.pct_of_total - (c.location_peer_pct ?? 0),
        is_underutilized: (c.pct_of_total - (c.location_peer_pct ?? 0)) < -2,
      }))
      .sort((a, b) => b.pct_of_total - a.pct_of_total)

    const coachingNotes =
      status !== 'on_target'
        ? buildCoachingNotes(vpd, upv, vpc, providerCpts)
        : []

    // VPD trend direction: compare week 1 vs week 4
    const vpdDelta = trend.vpd[3] - trend.vpd[0]
    const vpdTrendDir = vpdDelta > 0.3 ? 'up' : vpdDelta < -0.3 ? 'down' : 'flat'

    const weeklyRevGap = (vpd - VPD_TARGET) * current.days_worked * RPV_TARGET

    providerMetrics.push({
      provider_name: current.provider_name,
      provider_role: current.provider_role,
      location: current.location,
      is_support_role: current.provider_role === 'PTA' || current.provider_role === 'OTA',
      vpd_current: vpd,
      upv_current: upv,
      vpc_current: vpc,
      days_worked: current.days_worked,
      weekly_visits: current.total_visits,
      weekly_revenue: current.weekly_revenue ?? vpd * current.days_worked * RPV_TARGET,
      weekly_rev_gap: weeklyRevGap,
      trend,
      vpd_trend_direction: vpdTrendDir,
      status,
      root_cause: rootCause,
      coaching_notes: coachingNotes,
      cpt_utilization: providerCpts,
    })
  }

  // Build LocationRollup for each location in display order
  return LOCATIONS.map((loc) => {
    const locProviders = providerMetrics
      .filter((p) => p.location === loc)
      .sort((a, b) => b.vpd_current - a.vpd_current)

    const flagged = locProviders.filter((p) => p.status === 'needs_coaching')
    const nearTarget = locProviders.filter((p) => p.status === 'near_target')

    // Location-level status: worst among providers
    const locStatus: ProviderStatus =
      flagged.length > 0
        ? 'needs_coaching'
        : nearTarget.length > 0
        ? 'near_target'
        : 'on_target'

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0

    return {
      location: loc,
      provider_count: locProviders.length,
      flagged_count: flagged.length,
      avg_vpd: +avg(locProviders.map((p) => p.vpd_current)).toFixed(1),
      avg_upv: +avg(locProviders.map((p) => p.upv_current)).toFixed(1),
      avg_vpc: +avg(locProviders.filter((p) => p.vpc_current != null).map((p) => p.vpc_current!)).toFixed(1),
      status: locStatus,
      providers: locProviders,
    }
  }).filter((loc) => loc.provider_count > 0)
}

// ---------------------------------------------------------------------------
// fetchProviderSummaryStats
// System-wide summary stats for the top metric cards.
// ---------------------------------------------------------------------------
export async function fetchProviderSummaryStats(): Promise<ProviderSummaryStats> {
  const locations = await fetchProviderData()
  const allProviders = locations.flatMap((l) => l.providers)

  if (allProviders.length === 0) {
    return {
      avg_vpd: 0,
      avg_upv: 0,
      avg_vpc: 0,
      providers_at_target: 0,
      total_providers: 0,
      total_weekly_rev_gap: 0,
      flagged_provider_count: 0,
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 0

  const vpcValues = allProviders
    .filter((p) => p.vpc_current != null)
    .map((p) => p.vpc_current!)

  return {
    avg_vpd: avg(allProviders.map((p) => p.vpd_current)),
    avg_upv: avg(allProviders.map((p) => p.upv_current)),
    avg_vpc: avg(vpcValues),
    providers_at_target: allProviders.filter((p) => p.status === 'on_target').length,
    total_providers: allProviders.length,
    total_weekly_rev_gap: +allProviders
      .reduce((s, p) => s + p.weekly_rev_gap, 0)
      .toFixed(2),
    flagged_provider_count: allProviders.filter((p) => p.status === 'needs_coaching').length,
  }
}
