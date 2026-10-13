// src/components/features/providers/CptUtilizationGrid.tsx
// Shows top CPT codes for a flagged provider vs location peer averages.
// Color-coded: green = above peers, red = meaningfully below peers.
// Server Component.

import { cn } from '@/lib/utils'
import type { CptWithDelta } from '@/types/providers'

interface CptUtilizationGridProps {
  cpts: CptWithDelta[]
}

export function CptUtilizationGrid({ cpts }: CptUtilizationGridProps) {
  if (cpts.length === 0) return null

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border/40">
      <p className="text-[11px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
        CPT utilization vs location peers
      </p>
      <div className="grid grid-cols-5 gap-2">
        {cpts.slice(0, 5).map((cpt) => {
          const delta = cpt.peer_delta
          const isAbove = delta > 2
          const isBelow = delta < -2

          return (
            <div
              key={cpt.cpt_code}
              className={cn(
                'rounded-md border px-2 py-2',
                isBelow
                  ? 'bg-red-50 border-red-100'
                  : isAbove
                  ? 'bg-green-50 border-green-100'
                  : 'bg-background border-border/60'
              )}
            >
              {/* CPT code */}
              <p className="text-xs font-medium text-foreground">{cpt.cpt_code}</p>

              {/* Provider's actual % */}
              <p
                className={cn(
                  'text-sm font-medium tabular-nums',
                  isBelow ? 'text-red-700' : isAbove ? 'text-green-700' : 'text-foreground'
                )}
              >
                {cpt.pct_of_total.toFixed(0)}%
              </p>

              {/* vs peer */}
              <p className="text-[11px] text-muted-foreground">
                {delta > 0 ? '+' : ''}
                {delta.toFixed(0)}% vs peer
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
