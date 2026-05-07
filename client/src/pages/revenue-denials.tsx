/**
 * Revenue Denials — denial intelligence dashboard with top codes, outliers, and trend chart.
 * Gated to OWNER/DIRECTOR/ANALYST.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { XCircle, AlertTriangle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

function fmtPct(n: number) { return (n || 0).toFixed(1) + "%"; }
function fmt$(n: number) {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function RevenueDenialsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filterParams = new URLSearchParams();
  if (dateFrom) filterParams.set("dateFrom", dateFrom);
  if (dateTo) filterParams.set("dateTo", dateTo);
  const filterStr = filterParams.toString();

  interface DenialSummary { totalDenied: number; denialRate: number; topDenialCode: string; totalAtRisk: number; }
  interface DenialCode { denialCode: string; occurrences: number; totalAtRisk: number; payersAffected: number; }
  interface DenialOutlier { providerId?: string; providerName?: string; totalClaims: number; deniedClaims: number; denialRate: number; avgDenialRate: number; }
  interface DenialTrend { month: string; denialRate: number; }
  const { data: summary, isLoading: summaryLoading } = useQuery<DenialSummary>({
    queryKey: ["/api/revenue/denials/summary", filterStr],
    queryFn: () =>
      fetch(`/api/revenue/denials/summary?${filterStr}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: topCodes, isLoading: codesLoading } = useQuery<DenialCode[]>({
    queryKey: ["/api/revenue/denials/top-codes"],
    queryFn: () =>
      fetch("/api/revenue/denials/top-codes?limit=10", { credentials: "include" }).then(r => r.json()),
  });

  const { data: outliers, isLoading: outliersLoading } = useQuery<DenialOutlier[]>({
    queryKey: ["/api/revenue/denials/outliers", filterStr],
    queryFn: () =>
      fetch(`/api/revenue/denials/outliers?${filterStr}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: trends } = useQuery<DenialTrend[]>({
    queryKey: ["/api/revenue/denials/trends"],
    queryFn: () =>
      fetch("/api/revenue/denials/trends?months=12", { credentials: "include" }).then(r => r.json()),
  });

  const kpis: Array<{ label: string; value: string | number; format: (v: number) => string; color?: (v: number) => string }> = [
    { label: "Total Denied", value: summary?.totalDenied ?? 0, format: (v) => String(v) },
    { label: "Denial Rate", value: summary?.denialRate ?? 0, format: fmtPct, color: (v) => v > 15 ? "text-red-500" : v > 8 ? "text-yellow-500" : "text-green-500" },
    { label: "Top Denial Code", value: summary?.topDenialCode ?? "—", format: (v) => String(v) },
    { label: "Total $ at Risk", value: summary?.totalAtRisk ?? 0, format: fmt$ },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <XCircle className="w-6 h-6" /> Denial Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Analyze denial patterns, identify at-risk providers, and track trends.
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
              {summaryLoading ? (
                <Skeleton className="h-7 w-20 mt-1" />
              ) : (
                <p className={`text-2xl font-bold mt-0.5 ${k.color ? k.color(k.value as number) : ""}`}>
                  {k.format(k.value as number)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Denial Codes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Denial Codes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {codesLoading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">$ at Risk</TableHead>
                    <TableHead className="text-right">Payers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topCodes || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">
                        No denial codes found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (topCodes || []).map((c) => (
                      <TableRow key={c.denialCode}>
                        <TableCell className="font-mono text-sm">{c.denialCode}</TableCell>
                        <TableCell className="text-right">{c.occurrences}</TableCell>
                        <TableCell className="text-right text-red-600 font-medium">{fmt$(c.totalAtRisk)}</TableCell>
                        <TableCell className="text-right">{c.payersAffected}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Monthly Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Denial Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {(trends || []).length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                No trend data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => v + "%"} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [fmtPct(v), "Denial Rate"]} />
                  <Line
                    type="monotone"
                    dataKey="denialRate"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Provider Outliers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Provider Outliers (Denial Rate &gt;2x Average)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {outliersLoading ? (
            <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Total Claims</TableHead>
                  <TableHead className="text-right">Denied</TableHead>
                  <TableHead className="text-right">Denial Rate</TableHead>
                  <TableHead className="text-right">Avg Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(outliers || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                      No provider outliers detected.
                    </TableCell>
                  </TableRow>
                ) : (
                  (outliers || []).map((o) => (
                    <TableRow key={o.providerId || o.providerName} className="bg-red-50/50 dark:bg-red-950/20">
                      <TableCell className="font-medium">{o.providerName || o.providerId}</TableCell>
                      <TableCell className="text-right">{o.totalClaims}</TableCell>
                      <TableCell className="text-right">{o.deniedClaims}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">
                          {fmtPct(o.denialRate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtPct(o.avgDenialRate)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
