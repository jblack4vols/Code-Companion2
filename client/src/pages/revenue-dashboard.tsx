/**
 * Revenue Recovery Dashboard — KPI cards + reimbursement summary by payer.
 * Gated to OWNER/DIRECTOR/ANALYST.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, FileText, XCircle, Clock, Scale, TrendingUp } from "lucide-react";
import { Link } from "wouter";

function fmt$(n: number) {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return (n || 0).toFixed(1) + "%";
}

function realizationBadge(pct: number) {
  if (pct < 85) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (pct < 95) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
}

export default function RevenueDashboardPage() {
  interface RevenueSummaryRow {
    payer: string;
    claimCount: number;
    totalBilled: number;
    totalPaid: number;
    totalExpected: number;
    totalUnderpaid: number;
    underpaidCount: number;
    avgRealizationPct: number;
  }

  const { data: summary, isLoading: summaryLoading } = useQuery<RevenueSummaryRow[]>({
    queryKey: ["/api/revenue/summary"],
    queryFn: () => fetch("/api/revenue/summary", { credentials: "include" }).then(r => r.json()),
  });

  const { data: appealStats } = useQuery<{ won: number; winRate: number; totalRecovered: number }>({
    queryKey: ["/api/revenue/appeals/stats"],
    queryFn: () => fetch("/api/revenue/appeals/stats", { credentials: "include" }).then(r => r.json()),
  });

  // Aggregate KPIs from summary rows
  const totals = (summary || []).reduce(
    (acc, row) => ({
      totalUnderpaid: acc.totalUnderpaid + (row.totalUnderpaid || 0),
      totalBilled: acc.totalBilled + (row.totalBilled || 0),
      totalPaid: acc.totalPaid + (row.totalPaid || 0),
      underpaidCount: acc.underpaidCount + (row.underpaidCount || 0),
      claimCount: acc.claimCount + (row.claimCount || 0),
    }),
    { totalUnderpaid: 0, totalBilled: 0, totalPaid: 0, underpaidCount: 0, claimCount: 0 },
  );

  const recoveryRate = totals.totalBilled > 0
    ? (totals.totalPaid / totals.totalBilled) * 100
    : 0;

  const kpis = [
    {
      label: "Total Underpaid",
      value: fmt$(totals.totalUnderpaid),
      icon: DollarSign,
      sub: `${totals.underpaidCount} underpaid claims`,
      color: "text-red-500",
    },
    {
      label: "Recovery Rate",
      value: fmtPct(recoveryRate),
      icon: TrendingUp,
      sub: `${totals.claimCount} total claims`,
      color: recoveryRate >= 95 ? "text-green-500" : recoveryRate >= 85 ? "text-yellow-500" : "text-red-500",
    },
    {
      label: "Appeals Won",
      value: String(appealStats?.won ?? 0),
      icon: Scale,
      sub: `Win rate: ${fmtPct(appealStats?.winRate ?? 0)}`,
      color: "text-blue-500",
    },
    {
      label: "Total Recovered",
      value: fmt$(appealStats?.totalRecovered ?? 0),
      icon: DollarSign,
      sub: "via appeals",
      color: "text-green-500",
    },
  ];

  const quickLinks = [
    { label: "View Underpaid Claims", url: "/revenue/claims?isUnderpaid=true", icon: FileText },
    { label: "View Denials", url: "/revenue/denials", icon: XCircle },
    { label: "View Billing Lag", url: "/revenue/billing-lag", icon: Clock },
    { label: "View Appeals", url: "/revenue/appeals", icon: Scale },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Revenue Recovery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor reimbursement performance, underpayments, and appeal outcomes.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  {summaryLoading ? (
                    <Skeleton className="h-7 w-24 mt-1" />
                  ) : (
                    <p className={`text-2xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                </div>
                <kpi.icon className={`w-5 h-5 mt-0.5 ${kpi.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-2">
        {quickLinks.map((ql) => (
          <Link key={ql.url} href={ql.url}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ql.icon className="w-3.5 h-3.5" />
              {ql.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Reimbursement Summary by Payer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reimbursement Summary by Payer</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summaryLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payer</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Underpaid</TableHead>
                    <TableHead className="text-right">Realization %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(summary || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No data yet. Import claims to see reimbursement analysis.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (summary || []).map((row) => (
                      <TableRow key={row.payer}>
                        <TableCell className="font-medium">{row.payer}</TableCell>
                        <TableCell className="text-right">{row.claimCount}</TableCell>
                        <TableCell className="text-right">{fmt$(row.totalBilled)}</TableCell>
                        <TableCell className="text-right">{fmt$(row.totalPaid)}</TableCell>
                        <TableCell className="text-right">{fmt$(row.totalExpected)}</TableCell>
                        <TableCell className="text-right text-red-600 font-medium">
                          {fmt$(row.totalUnderpaid)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className={`text-xs ${realizationBadge(row.avgRealizationPct)}`}>
                            {fmtPct(row.avgRealizationPct)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
