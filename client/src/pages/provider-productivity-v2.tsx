/**
 * Provider Productivity v2 — main dashboard page.
 * Stat cards + location accordion with per-provider KPI rows.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, TrendingDown, Users, AlertTriangle } from "lucide-react";
import { ProviderProductivityV2Location } from "./provider-productivity-v2-location";
import type { LocationRollup } from "./provider-productivity-v2-location";

interface SummaryStats {
  avgVpd: number;
  avgUpv: number;
  totalWeeklyRevGap: number;
  flaggedProviderCount: number;
  totalProviders: number;
  providersAtTarget: number;
}

interface ApiResponse {
  summary: SummaryStats;
  locations: LocationRollup[];
}

function fmt$(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  valueClass,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className={`text-2xl font-bold tabular-nums ${valueClass ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function ProviderProductivityV2Page() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ["/api/provider-productivity/v2"],
    queryFn: async () => {
      const res = await fetch("/api/provider-productivity/v2", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load provider productivity data");
      return res.json();
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {error ? (error as Error).message : "No data available."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, locations } = data;
  const revGapClass =
    summary.totalWeeklyRevGap >= 0
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";

  // Open flagged locations by default
  const needsCoachingSet = new Set(
    locations
      .filter((l) => l.status === "needs_coaching")
      .map((l) => l.location)
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Provider Productivity
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          VPD / UPV KPI dashboard by location — most recent week
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Avg VPD"
          value={summary.avgVpd.toFixed(1)}
          sub={`Target ${10}`}
          icon={Activity}
          valueClass={summary.avgVpd >= 10 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
        />
        <StatCard
          title="Avg UPV"
          value={summary.avgUpv.toFixed(2)}
          sub={`Target ${4.0}`}
          icon={TrendingDown}
          valueClass={summary.avgUpv >= 4.0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
        />
        <StatCard
          title="Weekly Rev Gap"
          value={fmt$(summary.totalWeeklyRevGap)}
          sub="vs $95/visit target"
          icon={TrendingDown}
          valueClass={revGapClass}
        />
        <StatCard
          title="Flagged Providers"
          value={String(summary.flaggedProviderCount)}
          sub={`of ${summary.totalProviders} total`}
          icon={Users}
          valueClass={summary.flaggedProviderCount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}
        />
      </div>

      {/* Location accordions */}
      {locations.length === 0 ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
            <Activity className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No provider productivity records found. Import weekly data to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {locations.map((rollup) => (
            <ProviderProductivityV2Location
              key={rollup.location}
              rollup={rollup}
              defaultOpen={needsCoachingSet.has(rollup.location)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
