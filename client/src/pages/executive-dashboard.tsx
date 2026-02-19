import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, DollarSign, AlertTriangle, Activity } from "lucide-react";
import { format, subMonths } from "date-fns";
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

export default function ExecutiveDashboardPage() {
  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]?.value || monthOptions[0].value);

  const { data: execData, isLoading: loadingExec } = useQuery<any>({
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

  const physicianMap = new Map<string, Physician>();
  physicians?.forEach((p) => physicianMap.set(p.id, p));

  const topReferrers = (execData?.topReferrersByRevenue || []).slice(0, 20);

  const growthRateData = (execData?.growthRates || []).map((g: any) => ({
    month: format(new Date(g.month), "MMM yy"),
    rate: Number(g.rate),
  }));

  const monthlyTotals = execData?.monthlyTotals || {};
  const volumeData = Object.entries(monthlyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({
      month: format(new Date(month), "MMM yy"),
      count: Number(count),
    }));

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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-executive-dashboard-title">Executive Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">High-level referral performance overview</p>
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
                    <TableHead className="min-w-[180px]">Referring Provider</TableHead>
                    <TableHead>Referrals</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Arrival Rate</TableHead>
                    <TableHead>Tier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topReferrers.map((r: any, idx: number) => {
                    const phys = physicianMap.get(r.physicianId);
                    const name = phys ? `Dr. ${phys.firstName} ${phys.lastName}` : "Unknown";
                    return (
                      <TableRow key={r.physicianId || idx} data-testid={`row-referrer-${idx}`}>
                        <TableCell className="text-sm font-medium" data-testid={`text-referrer-name-${idx}`}>{name}</TableCell>
                        <TableCell className="text-sm" data-testid={`text-referrer-count-${idx}`}>{r.referralsCount}</TableCell>
                        <TableCell className="text-sm" data-testid={`text-referrer-revenue-${idx}`}>{formatCurrency(r.revenueGenerated || 0)}</TableCell>
                        <TableCell className="text-sm" data-testid={`text-referrer-arrival-${idx}`}>{formatPercent(r.arrivalRate || 0)}</TableCell>
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
