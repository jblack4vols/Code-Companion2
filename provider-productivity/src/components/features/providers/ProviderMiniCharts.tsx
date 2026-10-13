// src/components/features/providers/ProviderMiniCharts.tsx
// Small reusable visual components: sparkbar trend and mini KPI bar.
// Server Components — no client state needed.

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// SparkTrend — 4-bar sparkline showing weekly trend
// ---------------------------------------------------------------------------
interface SparkTrendProps {
  values: [number, number, number, number]
  target: number
}

export function SparkTrend({ values, target }: SparkTrendProps) {
  const max = Math.max(...values, target)

  return (
    <div className="flex items-end gap-0.5 h-4">
      {values.map((v, i) => {
        const heightPct = Math.max(15, (v / max) * 100)
        const color =
          v >= target
            ? 'bg-green-600'
            : v >= target * 0.85
            ? 'bg-amber-400'
            : 'bg-red-500'

        return (
          <div
            key={i}
            className={cn('w-1.5 rounded-sm', color)}
            style={{ height: `${heightPct}%` }}
            title={`Week ${i + 1}: ${v.toFixed(1)}`}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MiniKpiBar — horizontal progress bar for a single KPI value vs target
// ---------------------------------------------------------------------------
interface MiniKpiBarProps {
  value: number
  target: number
  label: string
}

export function MiniKpiBar({ value, target, label }: MiniKpiBarProps) {
  const pct = Math.min(100, (value / target) * 100)
  const color =
    value >= target
      ? 'bg-green-600'
      : value >= target * 0.85
      ? 'bg-amber-400'
      : 'bg-red-500'

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[32px]">
          <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium tabular-nums w-8">{label}</span>
      </div>
    </div>
  )
}
