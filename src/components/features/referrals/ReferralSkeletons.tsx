// src/components/features/referrals/ReferralStatsSkeleton.tsx
// Skeleton placeholder shown while summary stats are loading via Suspense.

import { Skeleton } from '@/components/ui/skeleton'

export function ReferralStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-md bg-muted/50 p-4">
          <Skeleton className="h-3 w-24 mb-2" />
          <Skeleton className="h-7 w-16 mb-1.5" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  )
}


// src/components/features/referrals/ReferralTableSkeleton.tsx
// Skeleton placeholder shown while referral source data is loading via Suspense.

export function ReferralTableSkeleton() {
  return (
    <div>
      {/* Gone-dark panel skeleton */}
      <div className="mb-5">
        <Skeleton className="h-10 w-full rounded-md mb-3" />
        <div className="rounded-lg border border-border/60 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 last:border-b-0">
              <div>
                <Skeleton className="h-4 w-48 mb-1.5" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-24 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="flex justify-between mb-3">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-40 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
      </div>
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="bg-muted/30 px-5 py-2.5 flex gap-6">
          {[28, 9, 10, 9, 10, 14, 20].map((w, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center px-5 py-3.5 border-t border-border/40 gap-6">
            <div className="flex items-center gap-2.5" style={{ width: '28%' }}>
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-32 mb-1" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-5 w-12 rounded-md" style={{ width: '9%' }} />
            <Skeleton className="h-4 w-8" style={{ width: '10%' }} />
            <Skeleton className="h-4 w-8" style={{ width: '9%' }} />
            <Skeleton className="h-4 w-10" style={{ width: '10%' }} />
            <Skeleton className="h-4 w-16" style={{ width: '14%' }} />
            <div className="flex items-center gap-2" style={{ width: '20%' }}>
              <Skeleton className="h-1.5 flex-1 rounded-full" />
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
