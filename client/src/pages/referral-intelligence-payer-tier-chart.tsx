/**
 * Referral Intelligence — payer tier breakdown chart sub-component.
 * Horizontal stacked bar showing provider count and case volume by tier (A/B/C).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Minimal source shape needed for tier aggregation */
export interface TierChartSource {
  tierLabel: string;
  casesYtd: number;
}

interface TierBucket {
  tier: string;
  label: string;
  providers: number;
  cases: number;
  color: string;
  barColor: string;
}

const TIER_CONFIG: Record<string, { label: string; color: string; barColor: string }> = {
  A: { label: "Tier A — BCBS / Medicare", color: "text-green-700 dark:text-green-400", barColor: "bg-green-500" },
  B: { label: "Tier B — Commercial / WC / VA", color: "text-yellow-700 dark:text-yellow-400", barColor: "bg-yellow-500" },
  C: { label: "Tier C — Medicaid / Self-Pay", color: "text-muted-foreground", barColor: "bg-muted-foreground/60" },
};

function aggregateTiers(sources: TierChartSource[]): TierBucket[] {
  const map: Record<string, { providers: number; cases: number }> = { A: { providers: 0, cases: 0 }, B: { providers: 0, cases: 0 }, C: { providers: 0, cases: 0 } };

  for (const s of sources) {
    // D-tier sources roll into C for display purposes
    const key = s.tierLabel === "A" || s.tierLabel === "B" || s.tierLabel === "C" ? s.tierLabel : "C";
    map[key].providers += 1;
    map[key].cases += s.casesYtd;
  }

  return ["A", "B", "C"].map((tier) => ({
    tier,
    ...TIER_CONFIG[tier],
    providers: map[tier].providers,
    cases: map[tier].cases,
  }));
}

interface Props {
  sources: TierChartSource[];
}

export function PayerTierChart({ sources }: Props) {
  if (sources.length === 0) return null;

  const buckets = aggregateTiers(sources);
  const totalCases = buckets.reduce((sum, b) => sum + b.cases, 0);
  const totalProviders = sources.length;
  const maxCases = Math.max(...buckets.map((b) => b.cases), 1);

  return (
    <Card data-testid="card-payer-tier-chart">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Payer Tier Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked summary bar */}
        <div className="flex h-3 rounded-full overflow-hidden" data-testid="bar-tier-stacked">
          {buckets.map((b) => {
            const pct = totalCases > 0 ? (b.cases / totalCases) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={b.tier}
                className={`${b.barColor} transition-all`}
                style={{ width: `${pct}%` }}
                title={`${b.label}: ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>

        {/* Per-tier detail rows */}
        <div className="space-y-3">
          {buckets.map((b) => {
            const casePct = totalCases > 0 ? (b.cases / totalCases) * 100 : 0;
            const provPct = totalProviders > 0 ? (b.providers / totalProviders) * 100 : 0;
            const barWidth = maxCases > 0 ? (b.cases / maxCases) * 100 : 0;

            return (
              <div key={b.tier} data-testid={`row-tier-${b.tier}`}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className={`font-medium ${b.color}`}>{b.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {b.providers} provider{b.providers !== 1 ? "s" : ""} ({provPct.toFixed(0)}%)
                    &middot; {b.cases.toLocaleString()} case{b.cases !== 1 ? "s" : ""} ({casePct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`${b.barColor} h-full rounded-full transition-all`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
