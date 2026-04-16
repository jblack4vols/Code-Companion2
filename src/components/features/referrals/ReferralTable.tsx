'use client'
// src/components/features/referrals/ReferralTable.tsx
// Interactive referral source table with client-side filtering and sorting.
// Receives pre-fetched data from the Server Component — no client data fetching.

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
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
import { Badge } from '@/components/ui/badge'
import type { ReferralSourceWithMetrics, ReferralSortKey } from '@/types/referrals'
import { cn } from '@/lib/utils'

// Location list matches the 8 Tristar clinic locations from CLAUDE.md
const LOCATIONS = [
  'All locations',
  'Morristown',
  'Maryville',
  'Bean Station',
  'Newport',
  'Jefferson City',
  'Rogersville',
  'New Tazewell',
  'Johnson City',
]

interface ReferralTableProps {
  sources: ReferralSourceWithMetrics[]
}

export function ReferralTable({ sources }: ReferralTableProps) {
  const [location, setLocation] = useState('All locations')
  const [tier, setTier] = useState('all')
  const [sort, setSort] = useState<ReferralSortKey>('roi_score')

  // Filter and sort entirely in JS — no round-trips for these interactions
  const filtered = useMemo(() => {
    return sources
      .filter((s) => !s.gone_dark) // gone-dark shown in GoneDarkPanel above table
      .filter((s) => location === 'All locations' || s.location === location)
      .filter((s) => tier === 'all' || s.payer_tier === tier)
      .sort((a, b) => b[sort] - a[sort])
  }, [sources, location, tier, sort])

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mr-1">
          Referrer rankings
        </p>
        <div className="ml-auto flex gap-2">
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l} value={l} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue placeholder="All tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All tiers</SelectItem>
              <SelectItem value="A" className="text-xs">Tier A</SelectItem>
              <SelectItem value="B" className="text-xs">Tier B</SelectItem>
              <SelectItem value="C" className="text-xs">Tier C</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as ReferralSortKey)}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="roi_score" className="text-xs">ROI score</SelectItem>
              <SelectItem value="cases_ytd" className="text-xs">Cases YTD</SelectItem>
              <SelectItem value="est_revenue_ytd" className="text-xs">Est. revenue</SelectItem>
              <SelectItem value="yoy_delta" className="text-xs">YoY change</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <Table style={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[28%] text-xs">Physician</TableHead>
              <TableHead className="w-[9%] text-xs">Tier</TableHead>
              <TableHead className="w-[10%] text-xs">Cases YTD</TableHead>
              <TableHead className="w-[9%] text-xs">YoY</TableHead>
              <TableHead className="w-[10%] text-xs">Avg visits</TableHead>
              <TableHead className="w-[14%] text-xs">Est. revenue</TableHead>
              <TableHead className="w-[20%] text-xs">ROI score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                  No referrers match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((source) => (
                <ReferralRow key={source.id} source={source} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        {filtered.length} referrer{filtered.length !== 1 ? 's' : ''} · Revenue estimated at $95 RPV
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReferralRow — individual table row
// ---------------------------------------------------------------------------
function ReferralRow({ source }: { source: ReferralSourceWithMetrics }) {
  const initials = source.physician_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <TableRow className="hover:bg-muted/20 transition-colors">
      {/* Physician name + practice */}
      <TableCell>
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar initials={initials} tier={source.payer_tier} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {source.physician_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">{source.practice}</p>
          </div>
        </div>
      </TableCell>

      {/* Payer tier badge */}
      <TableCell>
        <TierBadge tier={source.payer_tier} />
      </TableCell>

      {/* Cases YTD */}
      <TableCell className="text-sm font-medium tabular-nums">
        {source.cases_ytd}
      </TableCell>

      {/* YoY delta */}
      <TableCell>
        <YoyDelta delta={source.yoy_delta} />
      </TableCell>

      {/* Avg visits per case */}
      <TableCell className="text-sm tabular-nums text-muted-foreground">
        {source.avg_visits_per_case.toFixed(1)}
      </TableCell>

      {/* Estimated revenue */}
      <TableCell className="text-sm tabular-nums">
        {source.est_revenue_ytd.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })}
      </TableCell>

      {/* ROI score bar */}
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-[#FF8200]"
              style={{ width: `${source.roi_score}%` }}
            />
          </div>
          <span className="text-sm font-medium tabular-nums w-8 text-right">
            {source.roi_score}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ initials, tier }: { initials: string; tier: string }) {
  const colors: Record<string, string> = {
    A: 'bg-blue-50 text-blue-800',
    B: 'bg-orange-50 text-orange-800',
    C: 'bg-gray-100 text-gray-600',
  }
  return (
    <div
      className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0',
        colors[tier] ?? colors['C']
      )}
    >
      {initials}
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    A: 'bg-blue-50 text-blue-800 border-blue-100',
    B: 'bg-orange-50 text-orange-800 border-orange-100',
    C: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border',
        styles[tier] ?? styles['C']
      )}
    >
      Tier {tier}
    </span>
  )
}

function YoyDelta({ delta }: { delta: number }) {
  if (delta > 0) {
    return <span className="text-sm text-green-700 tabular-nums">+{delta}</span>
  }
  if (delta < 0) {
    return <span className="text-sm text-red-600 tabular-nums">{delta}</span>
  }
  return <span className="text-sm text-muted-foreground">—</span>
}
