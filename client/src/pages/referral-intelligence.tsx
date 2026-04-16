/**
 * Referral Intelligence page — stat cards, gone-dark alert panel, sortable source table.
 * Gated to OWNER / DIRECTOR / ANALYST.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, Star, MoonStar } from "lucide-react";
import { GoneDarkPanel, type GoneDarkSource } from "./referral-intelligence-gone-dark";
import { ReferralIntelligenceTable, type ReferralSource } from "./referral-intelligence-table";

interface ReferralSummary {
  active_referrers: number;
  cases_ytd: number;
  yoy_pct: number;
  tier_a_pct: number;
  tier_a_pct_prior_year: number;
  gone_dark_count: number;
}

function StatCard({
  label, value, sub, subPositive, icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  subPositive: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
          <p className={`text-xs mt-1 ${subPositive ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
            {sub}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    </div>
  );
}

export default function ReferralIntelligencePage() {
  const { data: summary, isLoading: summaryLoading } = useQuery<ReferralSummary>({
    queryKey: ["/api/referral-intelligence/summary"],
  });

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<ReferralSource[]>({
    queryKey: ["/api/referral-intelligence"],
  });

  const { data: goneDark = [], isLoading: goneDarkLoading } = useQuery<GoneDarkSource[]>({
    queryKey: ["/api/referral-intelligence/gone-dark"],
  });

  const isLoading = summaryLoading || sourcesLoading || goneDarkLoading;

  if (isLoading) return <LoadingSkeleton />;

  const yoyLabel = !summary ? "" :
    summary.yoy_pct > 0 ? `+${summary.yoy_pct}% vs prior year` :
    summary.yoy_pct < 0 ? `${summary.yoy_pct}% vs prior year` : "Flat vs prior year";

  const tierDelta = summary ? summary.tier_a_pct - summary.tier_a_pct_prior_year : 0;
  const tierLabel = tierDelta > 0 ? `+${tierDelta}pts vs prior year` :
    tierDelta < 0 ? `${tierDelta}pts vs prior year` : "Same as prior year";

  const statCards = summary ? [
    {
      label: "Active Referrers",
      value: String(summary.active_referrers),
      sub: `${summary.active_referrers >= 43 ? "+" : ""}${summary.active_referrers - 43} vs prior period`,
      subPositive: summary.active_referrers >= 43,
      icon: Users,
    },
    {
      label: "Cases YTD",
      value: summary.cases_ytd.toLocaleString(),
      sub: yoyLabel,
      subPositive: summary.yoy_pct >= 0,
      icon: FileText,
    },
    {
      label: "Tier A %",
      value: `${summary.tier_a_pct}%`,
      sub: tierLabel,
      subPositive: tierDelta >= 0,
      icon: Star,
    },
    {
      label: "Gone Dark",
      value: String(summary.gone_dark_count),
      sub: summary.gone_dark_count > 0 ? "Needs outreach" : "All sources active",
      subPositive: summary.gone_dark_count === 0,
      icon: MoonStar,
    },
  ] : [];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold font-heading">Referral Intelligence</h1>
        <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground">YTD 2026</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <GoneDarkPanel sources={goneDark} />

      <ReferralIntelligenceTable sources={sources} />
    </div>
  );
}
