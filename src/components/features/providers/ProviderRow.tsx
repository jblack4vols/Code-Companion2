// src/components/features/providers/ProviderRow.tsx
// Renders a single provider's table row, optional coaching note row,
// and optional CPT utilization grid row.
// Server Component — pure presentation, no state.

import { cn } from '@/lib/utils'
import { SparkTrend, MiniKpiBar } from './ProviderMiniCharts'
import { CptUtilizationGrid } from './CptUtilizationGrid'
import type { ProviderWithMetrics, ProviderStatus, RootCause } from '@/types/providers'
import { VPD_TARGET, UPV_TARGET } from '@/types/providers'

interface ProviderRowProps {
  provider: ProviderWithMetrics
}

// Status → visual styles
const STATUS_AVATAR: Record<ProviderStatus, string> = {
  on_target:      'bg-green-50 text-green-800',
  near_target:    'bg-amber-50 text-amber-800',
  needs_coaching: 'bg-red-50 text-red-700',
}
const STATUS_BADGE: Record<ProviderStatus, string> = {
  on_target:      'bg-green-50 text-green-800 border-green-100',
  near_target:    'bg-amber-50 text-amber-800 border-amber-100',
  needs_coaching: 'bg-red-50 text-red-700 border-red-100',
}
const STATUS_LABEL: Record<ProviderStatus, string> = {
  on_target:      'On target',
  near_target:    'Near target',
  needs_coaching: 'Needs coaching',
}

// Root cause → short human label
const ROOT_CAUSE_LABEL: Record<RootCause, string> = {
  scheduling_fill_rate:  'Scheduling / fill-rate',
  cpt_undercapture:      'CPT undercapture',
  rushing_missing_units: 'Rushing — missing units',
  engagement_caseload:   'Engagement / caseload',
  both_kpis_low:         'Both KPIs low',
  visits_per_case_low:   'Low visits per case',
}

export function ProviderRow({ provider: p }: ProviderRowProps) {
  const initials = p.provider_name.split(' ').slice(0, 2).map((w) => w[0]).join('')
  const isFlagged = p.status === 'needs_coaching'
  const revGapPositive = p.weekly_rev_gap >= 0

  return (
    <>
      {/* Main provider row */}
      <tr className="hover:bg-muted/20 transition-colors group">

        {/* Provider name + role */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0',
                STATUS_AVATAR[p.status]
              )}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-foreground truncate">
                  {p.provider_name}
                </span>
                {/* Role badge */}
                <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 text-muted-foreground border-border/60">
                  {p.provider_role}
                </span>
                {/* Support role indicator for PTA/OTA */}
                {p.is_support_role && (
                  <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-100">
                    Support
                  </span>
                )}
                {/* Downward trend warning */}
                {p.vpd_trend_direction === 'down' && p.status !== 'on_target' && (
                  <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-600 border-red-100">
                    Trending down
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* VPD + 4-week sparkline */}
        <td className="px-4 py-2.5">
          <MiniKpiBar
            value={p.vpd_current}
            target={VPD_TARGET}
            label={p.vpd_current.toFixed(1)}
          />
          <div className="mt-1.5">
            <SparkTrend values={p.trend.vpd} target={VPD_TARGET} />
          </div>
        </td>

        {/* UPV */}
        <td className="px-4 py-2.5">
          <MiniKpiBar
            value={p.upv_current}
            target={UPV_TARGET}
            label={p.upv_current.toFixed(1)}
          />
        </td>

        {/* Visits per case */}
        <td className="px-4 py-2.5 tabular-nums">
          {p.vpc_current != null ? (
            <span
              className={cn(
                'text-sm font-medium',
                p.vpc_current < 8 ? 'text-red-600' : 'text-foreground'
              )}
            >
              {p.vpc_current.toFixed(1)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </td>

        {/* Weekly visits */}
        <td className="px-4 py-2.5 text-sm font-medium tabular-nums">
          {p.weekly_visits}
        </td>

        {/* Weekly revenue */}
        <td className="px-4 py-2.5 text-sm font-medium tabular-nums">
          {p.weekly_revenue.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          })}
        </td>

        {/* Revenue gap */}
        <td className="px-4 py-2.5">
          <span
            className={cn(
              'text-sm font-medium tabular-nums',
              revGapPositive ? 'text-green-700' : 'text-red-600'
            )}
          >
            {revGapPositive ? '+' : ''}
            {p.weekly_rev_gap.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            })}
          </span>
        </td>

        {/* Status badge */}
        <td className="px-4 py-2.5">
          <span
            className={cn(
              'inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-md border',
              STATUS_BADGE[p.status]
            )}
          >
            {STATUS_LABEL[p.status]}
          </span>
        </td>
      </tr>

      {/* Coaching note row — only for flagged providers */}
      {isFlagged && p.coaching_notes.length > 0 && (
        <tr className="bg-orange-50/60">
          <td colSpan={8} className="px-4 py-2 border-t border-orange-100">
            <div className="flex items-start gap-2 flex-wrap">
              {p.root_cause && (
                <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 flex-shrink-0">
                  {ROOT_CAUSE_LABEL[p.root_cause]}
                </span>
              )}
              <span className="text-xs text-orange-900">
                {p.coaching_notes.join(' · ')}
              </span>
            </div>
          </td>
        </tr>
      )}

      {/* CPT utilization row — only for flagged providers with CPT data */}
      {isFlagged && p.cpt_utilization.length > 0 && (
        <tr>
          <td colSpan={8} className="p-0 border-t border-border/30">
            <CptUtilizationGrid cpts={p.cpt_utilization} />
          </td>
        </tr>
      )}
    </>
  )
}
