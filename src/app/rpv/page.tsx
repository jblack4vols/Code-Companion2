// src/app/rpv/page.tsx
// RPV Analytics by Location — Server Component entry point.
// Parallel data fetching via Suspense. Only RpvSortControls is a Client Component.

import { Suspense } from 'react'
import { fetchRpvByLocation, fetchRpvSummaryStats } from '@/lib/rpv'
import { RPV_TARGET } from '@/types/rpv'
import { RpvStatCard } from '@/components/features/rpv/RpvStatCard'
import { RpvSortControls } from '@/components/features/rpv/RpvSortControls'
import { RpvStatsSkeleton, RpvContentSkeleton } from '@/components/features/rpv/RpvSkeletons'

export const metadata = {
  title: 'RPV analytics — Tristar PT',
}

// Revalidate every 30 minutes — same cadence as the referral dashboard
export const revalidate = 1800

export default async function RpvPage() {
  return (
    <div className="px-6 py-6 max-w-screen-xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-medium text-foreground">RPV analytics</h1>
          <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground">
            YTD 2026
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Target: <span className="font-medium text-foreground">${RPV_TARGET}</span> per visit
        </p>
      </div>

      {/* Summary stats */}
      <Suspense fallback={<RpvStatsSkeleton />}>
        <RpvStatsRow />
      </Suspense>

      {/* Bar chart + payer table */}
      <Suspense fallback={<RpvContentSkeleton />}>
        <RpvContent />
      </Suspense>

    </div>
  )
}

// ---------------------------------------------------------------------------
// RpvStatsRow — async Server Component, fetches summary stats
// ---------------------------------------------------------------------------
async function RpvStatsRow() {
  const stats = await fetchRpvSummaryStats()

  const systemGapLabel =
    stats.total_monthly_gap < 0
      ? `${Math.abs(stats.total_monthly_gap).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })} left on table/mo`
      : `${stats.total_monthly_gap.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })} above target/mo`

  const systemRpvGap = +(stats.system_rpv - RPV_TARGET).toFixed(2)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
      <RpvStatCard
        label="System RPV"
        value={stats.system_rpv.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
        })}
        sub={
          systemRpvGap >= 0
            ? `$${systemRpvGap.toFixed(2)} above target`
            : `$${Math.abs(systemRpvGap).toFixed(2)} below $${RPV_TARGET} target`
        }
        subVariant={systemRpvGap >= 0 ? 'positive' : 'negative'}
      />
      <RpvStatCard
        label="Total monthly gap"
        value={Math.abs(stats.total_monthly_gap).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })}
        sub={systemGapLabel}
        subVariant={stats.total_monthly_gap >= 0 ? 'positive' : 'negative'}
      />
      <RpvStatCard
        label="Locations at target"
        value={`${stats.locations_at_target} of ${stats.total_locations}`}
        sub={`${stats.locations_near_target} near target`}
        subVariant={stats.locations_at_target >= 6 ? 'positive' : 'neutral'}
      />
      <RpvStatCard
        label="Critical locations"
        value={String(stats.locations_critical)}
        sub={stats.locations_critical > 0 ? 'RPV below $90' : 'All above $90'}
        subVariant={stats.locations_critical > 0 ? 'negative' : 'positive'}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// RpvContent — async Server Component, fetches full location data
// ---------------------------------------------------------------------------
async function RpvContent() {
  const locations = await fetchRpvByLocation()

  return <RpvSortControls locations={locations} />
}
