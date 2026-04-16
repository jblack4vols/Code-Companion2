// src/components/features/referrals/GoneDarkPanel.tsx
// Displays gone-dark referral sources with days-silent count.
// Shown above the main table whenever gone_dark sources exist.

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { ReferralSourceWithMetrics } from '@/types/referrals'

interface GoneDarkPanelProps {
  sources: ReferralSourceWithMetrics[]
}

export function GoneDarkPanel({ sources }: GoneDarkPanelProps) {
  if (sources.length === 0) return null

  return (
    <div className="mb-5">
      {/* Alert banner */}
      <Alert className="mb-3 border-orange-200 bg-orange-50 text-orange-900">
        <div className="flex items-center gap-2">
          {/* Orange dot indicator */}
          <span className="inline-block w-2 h-2 rounded-full bg-[#FF8200] flex-shrink-0" />
          <AlertDescription className="text-sm text-orange-900">
            <span className="font-medium">{sources.length} source{sources.length > 1 ? 's' : ''} gone dark</span>
            {' '}— no referrals in 60+ days:{' '}
            {sources.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <span className="font-medium">{s.physician_name}</span>
                {s.days_since_referral != null && (
                  <span className="text-orange-700"> ({s.days_since_referral}d)</span>
                )}
              </span>
            ))}
            . Schedule marketer outreach.
          </AlertDescription>
        </div>
      </Alert>

      {/* Gone-dark source cards */}
      <div className="rounded-lg border border-red-100 bg-background overflow-hidden">
        {sources.map((source, index) => (
          <div
            key={source.id}
            className={`flex items-center justify-between px-5 py-3.5 ${
              index < sources.length - 1 ? 'border-b border-border/50' : ''
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">
                  {source.physician_name}
                </span>
                <TierBadge tier={source.payer_tier} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {source.practice}
                {source.cases_prior_year > 0 && (
                  <> · {source.cases_prior_year} cases prior period</>
                )}
                {source.last_referral_date && (
                  <>
                    {' '}· Last referral{' '}
                    {new Date(source.last_referral_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              {source.days_since_referral != null && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-100">
                  {source.days_since_referral}d silent
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TierBadge — small inline payer tier indicator
// ---------------------------------------------------------------------------
function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    A: 'bg-blue-50 text-blue-800 border-blue-100',
    B: 'bg-orange-50 text-orange-800 border-orange-100',
    C: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md border ${
        styles[tier] ?? styles['C']
      }`}
    >
      Tier {tier}
    </span>
  )
}
