// src/components/features/rpv/RpvBarChart.tsx
// Horizontal bar chart showing each location's RPV vs the $95 target line.
// Server Component — receives pre-sorted data, no client state needed.

import { Badge } from '@/components/ui/badge'
import type { RpvLocationWithMetrics, RpvStatus } from '@/types/rpv'
import { RPV_TARGET } from '@/types/rpv'
import { cn } from '@/lib/utils'

interface RpvBarChartProps {
  locations: RpvLocationWithMetrics[]
}

// Status → Tailwind color classes for the bar fill
const BAR_COLORS: Record<RpvStatus, string> = {
  on_target:   'bg-green-600',
  near_target: 'bg-amber-400',
  critical:    'bg-red-500',
}

// Status → badge styles
const BADGE_STYLES: Record<RpvStatus, string> = {
  on_target:   'bg-green-50 text-green-800 border-green-100',
  near_target: 'bg-amber-50 text-amber-800 border-amber-100',
  critical:    'bg-red-50 text-red-700 border-red-100',
}

const BADGE_LABELS: Record<RpvStatus, string> = {
  on_target:   'On target',
  near_target: 'Near target',
  critical:    'Critical',
}

export function RpvBarChart({ locations }: RpvBarChartProps) {
  // Scale bars relative to the highest RPV value so the chart fills the space
  const maxRpv = Math.max(...locations.map((l) => l.rpv_actual), RPV_TARGET)
  const targetPct = (RPV_TARGET / maxRpv) * 100

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="px-5 py-4">

        {/* Legend */}
        <div className="flex items-center gap-5 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-600" />
            At/above target (≥$95)
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-400" />
            Near target ($90–$94)
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500" />
            Critical (&lt;$90)
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-0.5 h-4 bg-foreground/25 rounded" />
            $95 target
          </div>
        </div>

        {/* Column headers */}
        <div className="grid items-center gap-3 mb-1 pb-2 border-b border-border/50"
          style={{ gridTemplateColumns: '140px 1fr 72px 80px 90px' }}>
          <span className="text-xs font-medium text-muted-foreground">Location</span>
          <span className="text-xs font-medium text-muted-foreground">RPV vs target</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Actual</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Gap</span>
          <span className="text-xs font-medium text-muted-foreground text-right">Status</span>
        </div>

        {/* Location rows */}
        <div className="divide-y divide-border/40">
          {locations.map((loc) => {
            const barPct = (loc.rpv_actual / maxRpv) * 100
            const gapPositive = loc.gap_to_target >= 0

            return (
              <div
                key={loc.id}
                className="grid items-center gap-3 py-2.5"
                style={{ gridTemplateColumns: '140px 1fr 72px 80px 90px' }}
              >
                {/* Location name */}
                <div>
                  <p className="text-sm font-medium text-foreground leading-tight">
                    {loc.location}
                  </p>
                  {loc.location === 'Bean Station' && (
                    <p className="text-[11px] text-muted-foreground">Soft conversion</p>
                  )}
                  {loc.location === 'Johnson City' && (
                    <p className="text-[11px] text-muted-foreground">Est. Aug 2025</p>
                  )}
                </div>

                {/* Bar with target marker */}
                <div className="relative h-5 flex items-center">
                  {/* Background track */}
                  <div className="absolute inset-x-0 h-2 rounded-full bg-muted" />
                  {/* Filled bar */}
                  <div
                    className={cn('absolute left-0 h-2 rounded-full transition-all', BAR_COLORS[loc.status])}
                    style={{ width: `${barPct}%` }}
                  />
                  {/* Target line */}
                  <div
                    className="absolute w-px h-4 bg-foreground/30 rounded"
                    style={{ left: `${targetPct}%` }}
                  />
                </div>

                {/* Actual RPV */}
                <p className="text-sm font-medium text-foreground text-right tabular-nums">
                  {loc.rpv_actual.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                  })}
                </p>

                {/* Gap to target */}
                <p className={cn(
                  'text-sm text-right tabular-nums',
                  gapPositive ? 'text-green-700' : 'text-red-600'
                )}>
                  {gapPositive ? '+' : ''}
                  {loc.gap_to_target.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                  })}
                </p>

                {/* Status badge */}
                <div className="flex justify-end">
                  <span className={cn(
                    'inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-md border',
                    BADGE_STYLES[loc.status]
                  )}>
                    {BADGE_LABELS[loc.status]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
