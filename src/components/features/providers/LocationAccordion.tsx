'use client'
// src/components/features/providers/LocationAccordion.tsx
// Collapsible location rollup sections with per-provider tables inside.
// Client Component — owns expand/collapse state per location.

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProviderRow } from './ProviderRow'
import type { LocationRollup, ProviderStatus } from '@/types/providers'
import { cn } from '@/lib/utils'

interface LocationAccordionProps {
  locations: LocationRollup[]
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

export function LocationAccordion({ locations }: LocationAccordionProps) {
  // Auto-expand locations that have flagged providers on initial render
  const defaultExpanded = useMemo(() => {
    const set = new Set<string>()
    locations.forEach((l) => {
      if (l.flagged_count > 0) set.add(l.location)
    })
    return set
  }, [locations])

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded)
  const [filterMode, setFilterMode] = useState<'all' | 'flagged'>('all')

  function toggle(loc: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(loc) ? next.delete(loc) : next.add(loc)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(locations.map((l) => l.location)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  return (
    <div>
      {/* Controls row */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Performance by location
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={filterMode}
            onValueChange={(v) => setFilterMode(v as 'all' | 'flagged')}
          >
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All providers</SelectItem>
              <SelectItem value="flagged" className="text-xs">Flagged only</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={expandAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Location sections */}
      <div className="space-y-2">
        {locations.map((loc) => {
          const isOpen = expanded.has(loc.location)
          const displayProviders =
            filterMode === 'flagged'
              ? loc.providers.filter((p) => p.status === 'needs_coaching')
              : loc.providers

          // Hide location entirely if flagged-only filter returns nothing
          if (filterMode === 'flagged' && displayProviders.length === 0) return null

          return (
            <div key={loc.location}>
              {/* Location header row */}
              <button
                onClick={() => toggle(loc.location)}
                className={cn(
                  'w-full grid items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-colors',
                  'bg-muted/40 border-border/60 hover:border-border/80',
                  isOpen && 'rounded-b-none border-b-0'
                )}
                style={{
                  gridTemplateColumns: '20px 180px 90px 90px 80px 80px 1fr',
                }}
              >
                {/* Chevron */}
                <span
                  className={cn(
                    'text-muted-foreground transition-transform duration-200 text-sm',
                    isOpen && 'rotate-90'
                  )}
                >
                  ›
                </span>

                {/* Location name + provider count */}
                <div>
                  <p className="text-sm font-medium text-foreground">{loc.location}</p>
                  <p className="text-xs text-muted-foreground">
                    {loc.provider_count} provider{loc.provider_count !== 1 ? 's' : ''}
                    {loc.flagged_count > 0 && (
                      <span className="text-red-600 ml-1">· {loc.flagged_count} flagged</span>
                    )}
                  </p>
                </div>

                {/* Avg VPD */}
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Avg VPD</p>
                  <p className="text-sm font-medium">{loc.avg_vpd.toFixed(1)}</p>
                </div>

                {/* Avg UPV */}
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Avg UPV</p>
                  <p className="text-sm font-medium">{loc.avg_upv.toFixed(1)}</p>
                </div>

                {/* Avg VPC */}
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Avg VPC</p>
                  <p className={cn('text-sm font-medium', loc.avg_vpc < 8 ? 'text-red-600' : '')}>
                    {loc.avg_vpc.toFixed(1)}
                  </p>
                </div>

                {/* Flagged count */}
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Flagged</p>
                  <p className={cn('text-sm font-medium', loc.flagged_count > 0 ? 'text-red-600' : '')}>
                    {loc.flagged_count}
                  </p>
                </div>

                {/* Status badge */}
                <div className="flex justify-end">
                  <span
                    className={cn(
                      'inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border',
                      STATUS_BADGE[loc.status]
                    )}
                  >
                    {STATUS_LABEL[loc.status]}
                  </span>
                </div>
              </button>

              {/* Expanded provider table */}
              {isOpen && displayProviders.length > 0 && (
                <div className="border border-t-0 border-border/60 rounded-b-lg overflow-hidden">
                  <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="w-[24%] text-xs px-4">Provider</TableHead>
                        <TableHead className="w-[13%] text-xs px-4">
                          Visits/day
                          <span className="font-normal opacity-60 ml-1">+ 4wk</span>
                        </TableHead>
                        <TableHead className="w-[11%] text-xs px-4">UPV</TableHead>
                        <TableHead className="w-[9%] text-xs px-4">Visits/case</TableHead>
                        <TableHead className="w-[10%] text-xs px-4">Wk visits</TableHead>
                        <TableHead className="w-[12%] text-xs px-4">Wk revenue</TableHead>
                        <TableHead className="w-[11%] text-xs px-4">Rev gap</TableHead>
                        <TableHead className="w-[10%] text-xs px-4">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayProviders.map((provider) => (
                        <ProviderRow key={provider.provider_name} provider={provider} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Empty state when flagged filter returns nothing for open location */}
              {isOpen && displayProviders.length === 0 && (
                <div className="border border-t-0 border-border/60 rounded-b-lg px-5 py-4 text-sm text-muted-foreground">
                  No flagged providers at this location.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
