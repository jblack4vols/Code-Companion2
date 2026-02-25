import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, DollarSign, AlertTriangle, Activity, RefreshCw, Clock, ExternalLink } from "lucide-react";
import { format, subMonths } from "date-fns";
import { useLocation } from "wouter";
import type { Physician } from "@shared/schema";

function generateMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    const value = format(d, "yyyy-MM-01");
    const label = format(d, "MMMM yyyy");
    options.push({ value, label });
  }
  return options;
}

function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

const tierBadgeStyles: Record<string, string> = {
  A: "bg-chart-4/15 text-chart-4",
  B: "bg-chart-1/15 text-chart-1",
  C: "bg-chart-3/15 text-chart-3",
  D: "bg-chart-5/15 text-chart-5",
};

const CONCENTRATION_COLORS = ["hsl(var(--chart-5))", "hsl(var(--chart-4))"];

export default function ExecutiveDashboardPage() {
  const [, navigate] = useLocation();
  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]?.value || monthOptions[0].value);

  const { data: execData, isLoading: loadingExec, isError: execError, refetch, dataUpdatedAt } = useQuery<any>({
    queryKey: ["/api/dashboard/executive", { month: selectedMonth }],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/executive?month=${selectedMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch executive data");
      return res.json();
    },
  });

  const { data: physicians } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
  });

  const physicianMap = useMemo(() => {
    const map = new Map<string, Physician>();
    physicians?.forEach((p) => map.set(p.id, p));
    return map;
  }, [physicians]);

  const topReferrers = useMemo(() => {
    return (execData?.topReferrersByRevenue || []).slice(0, 20);
  }, [execData?.topReferrersByRevenue]);

  const growthRateData = useMemo(() => {
    return (execData?.growthRates || []).map((g: any) => ({
      month: format(new Date(g.month), "MMM yy"),
      rate: Number(g.rate),
    }));
  }, [execData?.growthRates]);

  const volumeData = useMemo(() => {
    const monthlyTotals = execData?.monthlyTotals || {};
    return Object.entries(monthlyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month: format(new Date(month), "MMM yy"),
        count: Number(count),
      }));
  }, [execData?.monthlyTotals]);

  const revenueVsReferralsData = useMemo(() => {
    if (!execData?.monthlyRevenue || !execData?.monthlyTotals) return [];
    const months = Object.keys(execData.monthlyTotals).sort();
    return months.map((m) => ({
      month: format(new Date(m), "MMM yy"),
      referrals: Number(execData.monthlyTotals[m] || 0),
      revenue: Number(execData.monthlyRevenue?.[m] || 0),
    }));
  }, [execData?.monthlyTotals, execData?.monthlyRevenue]);

  const concentrationData = useMemo(() => {
    const risk = execData?.concentrationRisk || 0;
    const top10Pct = Math.round(risk * 100);
    const restPct = 100 - top10Pct;
    return [
      { name: "Top 10 Providers", value: top10Pct },
      { name: "All Others", value: restPct },
    ];
  }, [execData?.concentrationRisk]);

  if (loadingExec) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (execError) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <p className="text-sm text-muted-foreground">Failed to load executive dashboard data</p>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-exec">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-executive-dashboard-title">Executive Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs sm:text-sm text-muted-foreground">High-level referral performance overview</p>
            {dataUpdatedAt > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-last-updated">
                <Clock className="w-3 h-3" />
                Updated {format(new Date(dataUpdatedAt), "h:mm a")}
              </span>
            )}
          </div>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[200px]" data-testid="select-month-filter">
            <SelectValue placeholder="Select Month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card data-testid="card-total-referrals">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Total Referrals</p>
              <p className="text-2xl font-bold mt-0.5">{(execData?.totalReferrals || 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-revenue">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold mt-0.5">{formatCurrency(execData?.totalRevenue || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-concentration-risk">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-5/15 text-chart-5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Concentration Risk</p>
              <p className="text-2xl font-bold mt-0.5">{formatPercent(execData?.concentrationRisk || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-volatility-index">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-3/15 text-chart-3">
              <Activity className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Volatility Index</p>
              <p className="text-2xl font-bold mt-0.5">{(execData?.volatilityIndex || 0).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-semibold">Top 20 Referral Sources</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topReferrers.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              No referral data for this month
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Referring Provider</TableHead>
                    <TableHead>Referrals</TableHead>
                    <TableHead className="hidden sm:table-cell">Revenue</TableHead>
                    <TableHead className="hidden sm:table-cell">Arrival Rate</TableHead>
                    <TableHead>Tier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topReferrers.map((r: any, idx: number) => {
                    const phys = physicianMap.get(r.physicianId);
                    const name = phys ? `Dr. ${phys.firstName} ${phys.lastName}` : "Unknown";
                    return (
                      <TableRow
                        key={r.physicianId || idx}
                        className={phys ? "cursor-pointer hover:bg-muted/50" : ""}
                        onClick={() => phys && navigate(`/physicians/${phys.id}`)}
                        data-testid={`row-referrer-${idx}`}
                      >
                        <TableCell className="text-sm font-medium" data-testid={`text-referrer-name-${idx}`}>
                          <span className="flex items-center gap-1.5">
                            {name}
                            {phys && <ExternalLink className="w-3 h-3 text-muted-foreground" />}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-referrer-count-${idx}`}>{r.referralsCount}</TableCell>
                        <TableCell className="text-sm hidden sm:table-cell" data-testid={`text-referrer-revenue-${idx}`}>{formatCurrency(r.revenueGenerated || 0)}</TableCell>
                        <TableCell className="text-sm hidden sm:table-cell" data-testid={`text-referrer-arrival-${idx}`}>{formatPercent(r.arrivalRate || 0)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${tierBadgeStyles[r.tierLabel] || ""}`}
                            data-testid={`badge-tier-${idx}`}
                          >
                            {r.tierLabel}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Revenue vs. Referrals</h3>
              <p className="text-xs text-muted-foreground">Monthly trend comparison</p>
            </div>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {revenueVsReferralsData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={revenueVsReferralsData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "revenue" ? formatCurrency(value) : value,
                      name === "revenue" ? "Revenue" : "Referrals",
                    ]}
                  />
                  <Legend />
                  <Bar yAxisId="right" dataKey="referrals" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} opacity={0.7} name="Referrals" />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 4 }} name="Revenue" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Concentration Risk</h3>
              <p className="text-xs text-muted-foreground">Top 10 providers share</p>
            </div>
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={concentrationData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  label={({ name, value }) => `${value}%`}
                  labelLine={false}
                >
                  {concentrationData.map((_, i) => (
                    <Cell key={i} fill={CONCENTRATION_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value}%`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-1">
              {concentrationData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CONCENTRATION_COLORS[i] }} />
                  <span className="flex-1">{d.name}</span>
                  <span className="font-medium">{d.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Growth Rate</h3>
              <p className="text-xs text-muted-foreground">Monthly referral growth trend</p>
            </div>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {growthRateData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={growthRateData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, "Growth Rate"]} />
                  <Line type="monotone" dataKey="rate" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                No growth data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Monthly Referral Volume</h3>
              <p className="text-xs text-muted-foreground">Referrals per month</p>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {volumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                No volume data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
