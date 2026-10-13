// src/app/providers/page.tsx
// Provider Productivity v2 — Server Component entry point.
// Parallel Suspense boundaries for stats and content.

import { Suspense } from 'react'
import { fetchProviderData, fetchProviderSummaryStats } from '@/lib/providers'
import { VPD_TARGET, UPV_TARGET, VPC_TARGET } from '@/types/providers'
import { ProviderStatCard } from '@/components/features/providers/ProviderComponents'
import { LocationAccordion } from '@/components/features/providers/LocationAccordion'
import {
  ProviderStatsSkeleton,
  ProviderContentSkeleton,
} from '@/components/features/providers/ProviderComponents'

export const metadata = {
  title: 'Provider productivity — Tristar PT',
}

export const revalidate = 900  // 15-minute cache — weekly data but refreshes during the day

export default async function ProvidersPage() {
  return (
    <div className="px-6 py-6 max-w-screen-xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-medium text-foreground">Provider productivity</h1>
          <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground">
            4-week rolling · week of Apr 14, 2026
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>VPD target: <span className="font-medium text-foreground">{VPD_TARGET}</span></span>
          <span>UPV target: <span className="font-medium text-foreground">{UPV_TARGET}</span></span>
          <span>VPC target: <span className="font-medium text-foreground">≥{VPC_TARGET}</span></span>
        </div>
      </div>

      {/* Summary stats */}
      <Suspense fallback={<ProviderStatsSkeleton />}>
        <ProviderStatsRow />
      </Suspense>

      {/* Location accordion with provider tables */}
      <Suspense fallback={<ProviderContentSkeleton />}>
        <ProviderContent />
      </Suspense>

    </div>
  )
}

// ---------------------------------------------------------------------------
// ProviderStatsRow — async Server Component
// ---------------------------------------------------------------------------
async function ProviderStatsRow() {
  const stats = await fetchProviderSummaryStats()

  const vpdGap = +(stats.avg_vpd - VPD_TARGET).toFixed(1)
  const upvGap = +(stats.avg_upv - UPV_TARGET).toFixed(1)

  return (
    <>
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <ProviderStatCard
          label="Avg visits / provider / day"
          value={stats.avg_vpd.toFixed(1)}
          sub={vpdGap >= 0 ? `${vpdGap.toFixed(1)} above target` : `${Math.abs(vpdGap).toFixed(1)} below ${VPD_TARGET} target`}
          subVariant={vpdGap >= 0 ? 'positive' : 'negative'}
        />
        <ProviderStatCard
          label="Avg units per visit"
          value={stats.avg_upv.toFixed(1)}
          sub={upvGap >= 0 ? `${upvGap.toFixed(1)} above target` : `${Math.abs(upvGap).toFixed(1)} below ${UPV_TARGET} target`}
          subVariant={upvGap >= 0 ? 'positive' : 'negative'}
        />
        <ProviderStatCard
          label="Providers at target"
          value={`${stats.providers_at_target} of ${stats.total_providers}`}
          sub={`${stats.flagged_provider_count} need coaching`}
          subVariant={stats.flagged_provider_count === 0 ? 'positive' : 'negative'}
        />
        <ProviderStatCard
          label="Avg visits per case"
          value={stats.avg_vpc.toFixed(1)}
          sub={stats.avg_vpc >= VPC_TARGET ? 'At or above target' : `Below ${VPC_TARGET} target`}
          subVariant={stats.avg_vpc >= VPC_TARGET ? 'positive' : 'negative'}
        />
      </div>

      {/* Weekly revenue recovery banner */}
      {stats.total_weekly_rev_gap < 0 && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-orange-50 border border-orange-200 mb-5 flex-wrap gap-3">
          <p className="text-sm text-orange-900">
            <span className="font-medium">{stats.flagged_provider_count} providers flagged</span>
            {' '}— weekly revenue gap vs full-target output
          </p>
          <p className="text-sm font-medium text-[#FF8200]">
            {Math.abs(stats.total_weekly_rev_gap).toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            })}{' '}
            recoverable
          </p>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ProviderContent — async Server Component, fetches all location rollups
// ---------------------------------------------------------------------------
async function ProviderContent() {
  const locations = await fetchProviderData()
  return <LocationAccordion locations={locations} />
}
