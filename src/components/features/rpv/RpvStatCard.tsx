// src/components/features/rpv/RpvStatCard.tsx
// Summary metric card for the RPV dashboard stats row.

import { cn } from '@/lib/utils'

interface RpvStatCardProps {
  label: string
  value: string
  sub?: string
  subVariant?: 'positive' | 'negative' | 'neutral'
}

export function RpvStatCard({
  label,
  value,
  sub,
  subVariant = 'neutral',
}: RpvStatCardProps) {
  const subColors = {
    positive: 'text-green-700',
    negative: 'text-red-600',
    neutral: 'text-muted-foreground',
  }

  return (
    <div className="rounded-md bg-muted/50 p-4">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <p className="text-2xl font-medium text-foreground">{value}</p>
      {sub && (
        <p className={cn('text-xs mt-1', subColors[subVariant])}>{sub}</p>
      )}
    </div>
  )
}
