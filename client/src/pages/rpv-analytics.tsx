/**
 * RPV Analytics page — revenue-per-visit KPIs, bar chart, and payer mix table.
 * Gated to OWNER / DIRECTOR / ANALYST.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { RpvChart, RPV_TARGET, type RpvLocation } from "./rpv-analytics-chart";
import { RpvPayerTable } from "./rpv-analytics-payer-table";

interface RpvSummary {
  system_rpv: number;
  total_monthly_gap: number;
  locations_at_target: number;
  total_locations: number;
  locations_near_target: number;
  locations_critical: number;
}

interface RpvApiResponse {
  summary: RpvSummary;
  locations: RpvLocation[];
}

function fmt$(n: number, decimals = 0) {
  return "$" + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function StatCard({
  label, value, sub, subPositive,
}: { label: string; value: string; sub: string; subPositive: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        <p className={`text-xs mt-1 ${subPositive ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {sub}
        </p>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    </div>
  );
}

export default function RpvAnalyticsPage() {
  const { data, isLoading } = useQuery<RpvApiResponse>({
    queryKey: ["/api/rpv/by-location"],
  });

  if (isLoading) return <LoadingSkeleton />;

  const summary = data?.summary;
  const locations = data?.locations ?? [];
  const systemRpvGap = summary ? +(summary.system_rpv - RPV_TARGET).toFixed(2) : 0;

  const statCards = summary ? [
    {
      label: "System RPV",
      value: fmt$(summary.system_rpv, 2),
      sub: systemRpvGap >= 0
        ? `$${systemRpvGap.toFixed(2)} above $${RPV_TARGET} target`
        : `$${Math.abs(systemRpvGap).toFixed(2)} below $${RPV_TARGET} target`,
      subPositive: systemRpvGap >= 0,
      icon: TrendingUp,
    },
    {
      label: "Total Monthly Gap",
      value: fmt$(summary.total_monthly_gap),
      sub: summary.total_monthly_gap >= 0 ? "above target / mo" : "left on table / mo",
      subPositive: summary.total_monthly_gap >= 0,
      icon: DollarSign,
    },
    {
      label: "Locations at Target",
      value: `${summary.locations_at_target} of ${summary.total_locations}`,
      sub: `${summary.locations_near_target} near target`,
      subPositive: summary.locations_at_target >= Math.ceil(summary.total_locations / 2),
      icon: CheckCircle2,
    },
    {
      label: "Critical Locations",
      value: String(summary.locations_critical),
      sub: summary.locations_critical > 0 ? "RPV below $90" : "All above $90",
      subPositive: summary.locations_critical === 0,
      icon: AlertTriangle,
    },
  ] : [];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold font-heading">RPV Analytics</h1>
        <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground">YTD 2026</span>
        <p className="text-xs text-muted-foreground ml-auto">
          Target: <span className="font-medium text-foreground">${RPV_TARGET}</span> per visit
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} subPositive={c.subPositive} />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">RPV by Location</CardTitle>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No location data available.</p>
          ) : (
            <RpvChart locations={locations} />
          )}
        </CardContent>
      </Card>

      <RpvPayerTable locations={locations} />
    </div>
  );
}
