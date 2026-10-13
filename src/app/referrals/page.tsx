// src/app/referrals/page.tsx
// Referral Intelligence Dashboard — Server Component.
// Fetches all data server-side, passes serialized props to Client Components.
// No loading spinners needed for initial data — Suspense handles it below.

import { Suspense } from 'react'
import { fetchReferralSources, fetchGoneDarkSources, fetchReferralSummaryStats } from '@/lib/referrals'
import { ReferralStatCard } from '@/components/features/referrals/ReferralStatCard'
import { GoneDarkPanel } from '@/components/features/referrals/GoneDarkPanel'
import { ReferralTable } from '@/components/features/referrals/ReferralTable'
import { ReferralTableSkeleton } from '@/components/features/referrals/ReferralTableSkeleton'
import { ReferralStatsSkeleton } from '@/components/features/referrals/ReferralStatsSkeleton'

export const metadata = {
  title: 'Referral intelligence — Tristar PT',
}

// Revalidate every 30 minutes — referral data doesn't need real-time updates
export const revalidate = 1800

export default async function ReferralsPage() {
  return (
    <div className="px-6 py-6 max-w-screen-xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-medium text-foreground">Referral intelligence</h1>
          <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground">
            YTD 2026
          </span>
        </div>
      </div>

      {/* Summary stats row */}
      <Suspense fallback={<ReferralStatsSkeleton />}>
        <ReferralStatsRow />
      </Suspense>

      {/* Gone-dark panel + main table */}
      <Suspense fallback={<ReferralTableSkeleton />}>
        <ReferralContent />
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReferralStatsRow — async Server Component that fetches summary stats
// ---------------------------------------------------------------------------
async function ReferralStatsRow() {
  const stats = await fetchReferralSummaryStats()

  const yoyLabel =
    stats.yoy_pct > 0
      ? `+${stats.yoy_pct}% vs prior year`
      : stats.yoy_pct < 0
      ? `${stats.yoy_pct}% vs prior year`
      : 'Flat vs prior year'

  const tierDelta = stats.tier_a_pct - stats.tier_a_pct_prior_year
  const tierLabel =
    tierDelta > 0
      ? `+${tierDelta}pts vs prior year`
      : tierDelta < 0
      ? `${tierDelta}pts vs prior year`
      : 'Same as prior year'

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
      <ReferralStatCard
        label="Active referrers"
        value={String(stats.active_referrers)}
        sub={`${stats.active_referrers > 40 ? '+' : ''}${stats.active_referrers - 43} vs prior period`}
        subVariant={stats.active_referrers >= 43 ? 'positive' : 'negative'}
      />
      <ReferralStatCard
        label="Cases YTD"
        value={stats.cases_ytd.toLocaleString()}
        sub={yoyLabel}
        subVariant={stats.yoy_pct >= 0 ? 'positive' : 'negative'}
      />
      <ReferralStatCard
        label="Tier A cases"
        value={`${stats.tier_a_pct}%`}
        sub={tierLabel}
        subVariant={tierDelta >= 0 ? 'positive' : 'negative'}
      />
      <ReferralStatCard
        label="Gone dark"
        value={String(stats.gone_dark_count)}
        sub={stats.gone_dark_count > 0 ? 'Needs outreach' : 'All sources active'}
        subVariant={stats.gone_dark_count > 0 ? 'negative' : 'positive'}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReferralContent — async Server Component that fetches all source data
// ---------------------------------------------------------------------------
async function ReferralContent() {
  // Fetch active sources and gone-dark sources in parallel
  const [allSources, goneDarkSources] = await Promise.all([
    fetchReferralSources(),
    fetchGoneDarkSources(),
  ])

  return (
    <>
      <GoneDarkPanel sources={goneDarkSources} />
      <ReferralTable sources={allSources} />
    </>
  )
}
