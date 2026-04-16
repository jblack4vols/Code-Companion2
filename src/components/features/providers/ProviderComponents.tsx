// src/components/features/providers/ProviderStatCard.tsx
import { cn } from '@/lib/utils'

interface ProviderStatCardProps {
  label: string
  value: string
  sub?: string
  subVariant?: 'positive' | 'negative' | 'neutral'
}

export function ProviderStatCard({ label, value, sub, subVariant = 'neutral' }: ProviderStatCardProps) {
  const subColors = {
    positive: 'text-green-700',
    negative: 'text-red-600',
    neutral: 'text-muted-foreground',
  }
  return (
    <div className="rounded-md bg-muted/50 p-4">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <p className="text-2xl font-medium text-foreground">{value}</p>
      {sub && <p className={cn('text-xs mt-1', subColors[subVariant])}>{sub}</p>}
    </div>
  )
}


// src/components/features/providers/ProviderSkeletons.tsx
import { Skeleton } from '@/components/ui/skeleton'

export function ProviderStatsSkeleton() {
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

export function ProviderContentSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border/60 px-4 py-3">
          <div
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: '20px 180px 90px 90px 80px 80px 1fr' }}
          >
            <Skeleton className="h-3 w-3" />
            <div>
              <Skeleton className="h-4 w-28 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-12 ml-auto" />
            <Skeleton className="h-4 w-12 ml-auto" />
            <Skeleton className="h-4 w-10 ml-auto" />
            <Skeleton className="h-4 w-8 ml-auto" />
            <Skeleton className="h-6 w-24 rounded-md ml-auto" />
          </div>
        </div>
      ))}
    </div>
  )
}
