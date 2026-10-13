// src/components/features/rpv/RpvSkeletons.tsx
// Suspense loading skeletons for the RPV analytics page.
// Matches the exact layout to eliminate cumulative layout shift.

import { Skeleton } from '@/components/ui/skeleton'

export function RpvStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-md bg-muted/50 p-4">
          <Skeleton className="h-3 w-24 mb-2" />
          <Skeleton className="h-7 w-20 mb-1.5" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

export function RpvContentSkeleton() {
  return (
    <div>
      {/* Sort control row */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-44 rounded-md" />
      </div>

      {/* Bar chart skeleton */}
      <div className="rounded-lg border border-border/60 p-5 mb-5">
        <div className="flex gap-5 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-28" />
          ))}
        </div>
        {/* Header row */}
        <div className="grid gap-3 pb-2 mb-1 border-b border-border/50"
          style={{ gridTemplateColumns: '140px 1fr 72px 80px 90px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
        {/* Location rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid gap-3 py-3 border-b border-border/30 last:border-b-0"
            style={{ gridTemplateColumns: '140px 1fr 72px 80px 90px' }}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-6 w-20 rounded-md ml-auto" />
          </div>
        ))}
      </div>

      {/* Payer mix table skeleton */}
      <Skeleton className="h-4 w-36 mb-3" />
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="bg-muted/30 px-5 py-2.5">
          <Skeleton className="h-3 w-full" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center px-5 py-3 border-t border-border/40 gap-4">
            <Skeleton className="h-4 w-24 flex-shrink-0" />
            <Skeleton className="h-2 flex-1 rounded-full" />
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-10 flex-shrink-0" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
