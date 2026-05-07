import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Users, BarChart3, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";

interface ROIProvider {
  physician_id: string;
  first_name: string;
  last_name: string;
  credentials: string;
  specialty: string;
  practice_name: string;
  status: string;
  relationship_stage: string;
  total_referrals: number;
  total_visits: number;
  total_revenue: string;
  revenue_per_referral: string;
  visits_per_referral: string;
  best_tier: string;
  months_active: number;
}

interface ROISummary {
  totalRevenue: number;
  totalReferrals: number;
  avgRevenuePerReferral: number;
  providerCount: number;
  months: number;
}

interface ROIData {
  providers: ROIProvider[];
  summary: ROISummary;
}

type SortField = "name" | "specialty" | "best_tier" | "total_referrals" | "total_visits" | "total_revenue" | "revenue_per_referral" | "visits_per_referral";
type SortDirection = "asc" | "desc";

const formatCurrency = (value: number | string) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

const formatNumber = (value: number | string) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US").format(num);
};

const tierColors: Record<string, string> = {
  A: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  B: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  C: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  D: "bg-muted text-muted-foreground border-muted-foreground/20",
};

export default function ROICalculatorPage() {
  const [months, setMonths] = useState("6");
  const [sortField, setSortField] = useState<SortField>("total_revenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data, isLoading } = useQuery<ROIData>({
    queryKey: ["/api/roi/providers", `?months=${months}`],
  });

  const sortedProviders = useMemo(() => {
    if (!data?.providers) return [];
    return [...data.providers].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortField) {
        case "name":
          aVal = `${a.last_name} ${a.first_name}`;
          bVal = `${b.last_name} ${b.first_name}`;
          break;
        case "specialty":
          aVal = a.specialty || "";
          bVal = b.specialty || "";
          break;
        case "best_tier":
          aVal = a.best_tier || "Z";
          bVal = b.best_tier || "Z";
          break;
        case "total_referrals":
          aVal = a.total_referrals;
          bVal = b.total_referrals;
          break;
        case "total_visits":
          aVal = a.total_visits;
          bVal = b.total_visits;
          break;
        case "total_revenue":
          aVal = parseFloat(a.total_revenue);
          bVal = parseFloat(b.total_revenue);
          break;
        case "revenue_per_referral":
          aVal = parseFloat(a.revenue_per_referral);
          bVal = parseFloat(b.revenue_per_referral);
          break;
        case "visits_per_referral":
          aVal = parseFloat(a.visits_per_referral);
          bVal = parseFloat(b.visits_per_referral);
          break;
        default:
          return 0;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [data?.providers, sortField, sortDirection]);

  const top10ByRevenue = useMemo(() => {
    if (!data?.providers) return [];
    return [...data.providers]
      .sort((a, b) => parseFloat(b.total_revenue) - parseFloat(a.total_revenue))
      .slice(0, 10);
  }, [data?.providers]);

  const maxRevenue = top10ByRevenue.length > 0 ? parseFloat(top10ByRevenue[0].total_revenue) : 1;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Skeleton className="h-8 w-48" data-testid="skeleton-title" />
          <Skeleton className="h-9 w-36" data-testid="skeleton-select" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-roi-title">ROI Calculator</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Identify which provider relationships generate the most value</p>
        </div>
        <Select value={months} onValueChange={setMonths} data-testid="select-months-wrapper">
          <SelectTrigger className="w-[140px]" data-testid="select-months">
            <SelectValue placeholder="Time Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3" data-testid="select-months-3">Last 3 months</SelectItem>
            <SelectItem value="6" data-testid="select-months-6">Last 6 months</SelectItem>
            <SelectItem value="12" data-testid="select-months-12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card data-testid="card-total-revenue">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-green-500/15 text-green-600 dark:text-green-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-total-revenue">{formatCurrency(summary?.totalRevenue || 0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-referrals">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Total Referrals</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-total-referrals">{formatNumber(summary?.totalReferrals || 0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-revenue">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Avg Revenue/Referral</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-avg-revenue">{formatCurrency(summary?.avgRevenuePerReferral || 0)}</p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-active-providers">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-blue-500/15 text-blue-600 dark:text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Active Providers</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-active-providers">{formatNumber(summary?.providerCount || 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-providers-table">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">Top Providers by ROI</h3>
            <p className="text-xs text-muted-foreground">{sortedProviders.length} providers in the last {months} months</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")} data-testid="th-name">
                    <span className="flex items-center gap-1">Provider <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("specialty")} data-testid="th-specialty">
                    <span className="flex items-center gap-1">Specialty <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("best_tier")} data-testid="th-tier">
                    <span className="flex items-center gap-1">Tier <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("total_referrals")} data-testid="th-referrals">
                    <span className="flex items-center justify-end gap-1">Referrals <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("total_visits")} data-testid="th-visits">
                    <span className="flex items-center justify-end gap-1">Visits <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("total_revenue")} data-testid="th-revenue">
                    <span className="flex items-center justify-end gap-1">Revenue <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("revenue_per_referral")} data-testid="th-rev-per-referral">
                    <span className="flex items-center justify-end gap-1">Rev/Referral <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("visits_per_referral")} data-testid="th-visits-per-referral">
                    <span className="flex items-center justify-end gap-1">Visits/Referral <ArrowUpDown className="w-3 h-3" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground" data-testid="text-no-providers">
                      No provider data available for this time period
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedProviders.map((provider) => (
                    <TableRow key={provider.physician_id} data-testid={`row-provider-${provider.physician_id}`}>
                      <TableCell>
                        <Link href={`/scorecard/${provider.physician_id}`} data-testid={`link-provider-${provider.physician_id}`}>
                          <span className="text-sm font-medium text-primary hover:underline cursor-pointer">
                            {provider.first_name} {provider.last_name}{provider.credentials ? `, ${provider.credentials}` : ""}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`text-specialty-${provider.physician_id}`}>
                        {provider.specialty || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${tierColors[provider.best_tier] || tierColors.D}`}
                          data-testid={`badge-tier-${provider.physician_id}`}
                        >
                          {provider.best_tier || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid={`text-referrals-${provider.physician_id}`}>
                        {formatNumber(provider.total_referrals)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid={`text-visits-${provider.physician_id}`}>
                        {formatNumber(provider.total_visits)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium" data-testid={`text-revenue-${provider.physician_id}`}>
                        {formatCurrency(provider.total_revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid={`text-rev-per-referral-${provider.physician_id}`}>
                        {formatCurrency(provider.revenue_per_referral)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid={`text-visits-per-referral-${provider.physician_id}`}>
                        {(parseFloat(provider.visits_per_referral) || 0).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {top10ByRevenue.length > 0 && (
        <Card data-testid="card-revenue-chart">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Top 10 Providers by Revenue</h3>
              <p className="text-xs text-muted-foreground">Visual comparison of revenue contribution</p>
            </div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            {top10ByRevenue.map((provider, index) => {
              const revenue = parseFloat(provider.total_revenue);
              const pct = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0;
              return (
                <div key={provider.physician_id} className="space-y-1" data-testid={`bar-provider-${provider.physician_id}`}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/scorecard/${provider.physician_id}`}>
                      <span className="text-sm font-medium hover:underline cursor-pointer truncate" data-testid={`bar-name-${provider.physician_id}`}>
                        {index + 1}. {provider.first_name} {provider.last_name}{provider.credentials ? `, ${provider.credentials}` : ""}
                      </span>
                    </Link>
                    <span className="text-sm font-medium tabular-nums shrink-0" data-testid={`bar-revenue-${provider.physician_id}`}>
                      {formatCurrency(revenue)}
                    </span>
                  </div>
                  <div className="w-full h-6 rounded-md bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-md bg-primary/70 transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                      data-testid={`bar-fill-${provider.physician_id}`}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
