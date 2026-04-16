'use client'
// src/components/features/rpv/RpvSortControls.tsx
// Client Component — owns the sort state and re-orders the passed-in data.
// Wraps RpvBarChart and PayerMixTable so they stay as Server Components.

import { useState, useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RpvBarChart } from '@/components/features/rpv/RpvBarChart'
import { PayerMixTable } from '@/components/features/rpv/PayerMixTable'
import type { RpvLocationWithMetrics, RpvSortKey } from '@/types/rpv'

interface RpvSortControlsProps {
  locations: RpvLocationWithMetrics[]
}

export function RpvSortControls({ locations }: RpvSortControlsProps) {
  const [sort, setSort] = useState<RpvSortKey>('rpv_actual')

  const sorted = useMemo(() => {
    return [...locations].sort((a, b) => {
      switch (sort) {
        case 'rpv_actual':
          // Highest RPV first
          return b.rpv_actual - a.rpv_actual
        case 'gap_to_target':
          // Biggest negative gap first (worst performers at top)
          return a.gap_to_target - b.gap_to_target
        case 'visits':
          // Highest volume first
          return b.visits - a.visits
        case 'monthly_gap_dollars':
          // Largest dollar gap first (most revenue at risk)
          return a.monthly_gap_dollars - b.monthly_gap_dollars
        default:
          return 0
      }
    })
  }, [locations, sort])

  return (
    <div>
      {/* Sort control row */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          RPV vs $95 target — all locations
        </p>
        <Select value={sort} onValueChange={(v) => setSort(v as RpvSortKey)}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rpv_actual" className="text-xs">
              Sort: RPV actual
            </SelectItem>
            <SelectItem value="gap_to_target" className="text-xs">
              Sort: gap to target
            </SelectItem>
            <SelectItem value="visits" className="text-xs">
              Sort: visit volume
            </SelectItem>
            <SelectItem value="monthly_gap_dollars" className="text-xs">
              Sort: monthly $ gap
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bar chart — re-renders on sort change */}
      <div className="mb-5">
        <RpvBarChart locations={sorted} />
      </div>

      {/* Payer mix section label */}
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
        Payer mix by location
      </p>

      {/* Payer mix table — matches bar chart sort order */}
      <PayerMixTable locations={sorted} />
    </div>
  )
}
