/**
 * Revenue Billing Lag — AR aging buckets, cycle time metrics, by-payer/location tabs, stale claims.
 * Gated to OWNER/DIRECTOR/ANALYST.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

function fmt$(n: number) {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDays(n: number) { return (n || 0).toFixed(1) + " d"; }

// Color buckets: green → yellow → orange → red
const AGING_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444"];

export default function RevenueBillingLagPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filterParams = new URLSearchParams();
  if (dateFrom) filterParams.set("dateFrom", dateFrom);
  if (dateTo) filterParams.set("dateTo", dateTo);
  const filterStr = filterParams.toString();

  interface AgingBucket { count: number; amount: number; }
  interface AgingData { bucket0_30: AgingBucket; bucket31_60: AgingBucket; bucket61_90: AgingBucket; bucket90plus: AgingBucket; }
  interface BillingMetrics { avgDaysToSubmit: number; avgDaysToPay: number; avgCycleTime: number; outstandingAmount: number; }
  const { data: aging, isLoading: agingLoading } = useQuery<AgingData>({
    queryKey: ["/api/revenue/billing-lag/aging"],
    queryFn: () =>
      fetch("/api/revenue/billing-lag/aging", { credentials: "include" }).then(r => r.json()),
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<BillingMetrics>({
    queryKey: ["/api/revenue/billing-lag/metrics", filterStr],
    queryFn: () =>
      fetch(`/api/revenue/billing-lag/metrics?${filterStr}`, { credentials: "include" }).then(r => r.json()),
  });

  interface BreakdownRow { payer?: string; locationName?: string; claimCount?: number; claims?: number; avgDaysToSubmit?: number; avgSubmission?: number; avgDaysToPay?: number; avgPayment?: number; avgCycleTime?: number; avgCycle?: number; outstandingAmount?: number; outstanding?: number; }
  interface StaleClaimRow { id: string; claimNumber: string; dos: string; payer?: string; billedAmount?: string | number; daysSinceDos?: number; daysOpen?: number; }
  const { data: byPayer, isLoading: payerLoading } = useQuery<BreakdownRow[]>({
    queryKey: ["/api/revenue/billing-lag/by-payer", filterStr],
    queryFn: () =>
      fetch(`/api/revenue/billing-lag/by-payer?${filterStr}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: byLocation, isLoading: locationLoading } = useQuery<BreakdownRow[]>({
    queryKey: ["/api/revenue/billing-lag/by-location", filterStr],
    queryFn: () =>
      fetch(`/api/revenue/billing-lag/by-location?${filterStr}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: staleClaims, isLoading: staleLoading } = useQuery<StaleClaimRow[]>({
    queryKey: ["/api/revenue/billing-lag/stale"],
    queryFn: () =>
      fetch("/api/revenue/billing-lag/stale?thresholdDays=7", { credentials: "include" }).then(r => r.json()),
  });

  // Build AR aging chart data from bucket response
  const agingChartData = [
    { label: "0-30 Days", count: aging?.bucket0_30?.count ?? 0, amount: aging?.bucket0_30?.amount ?? 0 },
    { label: "31-60 Days", count: aging?.bucket31_60?.count ?? 0, amount: aging?.bucket31_60?.amount ?? 0 },
    { label: "61-90 Days", count: aging?.bucket61_90?.count ?? 0, amount: aging?.bucket61_90?.amount ?? 0 },
    { label: "90+ Days", count: aging?.bucket90plus?.count ?? 0, amount: aging?.bucket90plus?.amount ?? 0 },
  ];

  const kpis = [
    { label: "Avg Days to Submit", value: metrics?.avgDaysToSubmit ?? 0, format: fmtDays },
    { label: "Avg Days to Pay", value: metrics?.avgDaysToPay ?? 0, format: fmtDays },
    { label: "Avg Cycle Time", value: metrics?.avgCycleTime ?? 0, format: fmtDays },
    { label: "Outstanding $", value: metrics?.outstandingAmount ?? 0, format: fmt$ },
  ];

  const breakdownCols = ["Payer / Location", "Claims", "Avg Submit (d)", "Avg Payment (d)", "Avg Cycle (d)", "Outstanding"];

  function renderBreakdownTable(rows: BreakdownRow[], isLoading: boolean, nameKey: keyof BreakdownRow) {
    if (isLoading) {
      return <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {breakdownCols.map(c => (
              <TableHead key={c} className={c !== breakdownCols[0] ? "text-right" : ""}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows || []).length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">No data available.</TableCell>
            </TableRow>
          ) : (
            (rows || []).map((r, i: number) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-sm">{r[nameKey] || "—"}</TableCell>
                <TableCell className="text-right text-sm">{r.claimCount ?? r.claims ?? 0}</TableCell>
                <TableCell className="text-right text-sm">{fmtDays(r.avgDaysToSubmit ?? r.avgSubmission ?? 0)}</TableCell>
                <TableCell className="text-right text-sm">{fmtDays(r.avgDaysToPay ?? r.avgPayment ?? 0)}</TableCell>
                <TableCell className="text-right text-sm">{fmtDays(r.avgCycleTime ?? r.avgCycle ?? 0)}</TableCell>
                <TableCell className="text-right text-sm font-medium">{fmt$(r.outstandingAmount ?? r.outstanding ?? 0)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Clock className="w-6 h-6" /> Billing Lag
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track AR aging, submission delays, and payment cycle times.
        </p>
      </div>

      {/* Date Filters */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-sm w-36" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              {metricsLoading ? (
                <Skeleton className="h-7 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold mt-0.5">{k.format(k.value)}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AR Aging Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AR Aging Buckets</CardTitle>
        </CardHeader>
        <CardContent>
          {agingLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingChartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => String(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => "$" + (v / 1000).toFixed(0) + "k"} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "amount" ? [fmt$(value), "Amount"] : [value, "Claims"]
                  }
                />
                <Bar yAxisId="left" dataKey="count" name="Claims" radius={[4, 4, 0, 0]}>
                  {agingChartData.map((_, idx) => (
                    <Cell key={idx} fill={AGING_COLORS[idx]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabs: By Payer | By Location | Stale Claims */}
      <Card>
        <CardContent className="pt-4 p-0">
          <Tabs defaultValue="payer">
            <div className="px-4 border-b">
              <TabsList className="h-9 mb-0 bg-transparent gap-1">
                <TabsTrigger value="payer" className="text-sm">By Payer</TabsTrigger>
                <TabsTrigger value="location" className="text-sm">By Location</TabsTrigger>
                <TabsTrigger value="stale" className="text-sm">Stale Claims</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="payer" className="mt-0">
              {renderBreakdownTable(byPayer || [], payerLoading, "payer")}
            </TabsContent>
            <TabsContent value="location" className="mt-0">
              {renderBreakdownTable(byLocation || [], locationLoading, "locationName")}
            </TabsContent>
            <TabsContent value="stale" className="mt-0">
              {staleLoading ? (
                <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>DOS</TableHead>
                      <TableHead>Payer</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Days Since DOS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(staleClaims || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                          No stale claims found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (staleClaims || []).map((c) => (
                        <TableRow key={c.id} className="bg-yellow-50/50 dark:bg-yellow-950/20">
                          <TableCell className="font-mono text-xs">{c.claimNumber}</TableCell>
                          <TableCell className="text-sm">{c.dos}</TableCell>
                          <TableCell className="text-sm">{c.payer || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt$(parseFloat(String(c.billedAmount ?? 0)))}</TableCell>
                          <TableCell className="text-right text-sm font-medium text-yellow-700 dark:text-yellow-400">
                            {c.daysSinceDos ?? c.daysOpen ?? "—"} d
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
