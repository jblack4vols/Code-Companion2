/**
 * BCBS Audit Status Panel — payer-scoped claim-lifecycle + exposure dashboard.
 * Gated to OWNER/DIRECTOR/ANALYST. Defaults to Blue Cross Blue Shield claims.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

function fmtPct(n: number) { return (n || 0).toFixed(1) + "%"; }
function fmt$(n: number) {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface StatusBucket { status: string; claimCount: number; billed: number; paid: number; underpaid: number; }
interface FlaggedClaim {
  id: string; claimNumber: string; dos: string; cptCodes: string | null;
  status: string | null; billed: number; paid: number; underpaidAmount: number; denialCodes: string | null;
}
interface BcbsAudit {
  payerLabel: string;
  kpis: { totalClaims: number; totalBilled: number; totalPaid: number; atRisk: number; openAppeals: number; appealWinPct: number; };
  byStatus: StatusBucket[];
  flaggedClaims: FlaggedClaim[];
}

const STATUS_BADGE: Record<string, string> = {
  DENIED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  APPEALED: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  PARTIAL: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function RevenueBcbsAuditPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const filterStr = params.toString();

  const { data, isLoading } = useQuery<BcbsAudit>({
    queryKey: ["/api/revenue/bcbs-audit", filterStr],
    queryFn: () =>
      fetch(`/api/revenue/bcbs-audit?${filterStr}`, { credentials: "include" }).then(r => r.json()),
  });

  const kpis: Array<{ label: string; value: number; format: (v: number) => string; color?: string }> = [
    { label: "Claims Under Audit", value: data?.kpis.totalClaims ?? 0, format: (v) => String(v) },
    { label: "Total Billed", value: data?.kpis.totalBilled ?? 0, format: fmt$ },
    { label: "Total Paid", value: data?.kpis.totalPaid ?? 0, format: fmt$ },
    { label: "$ at Risk", value: data?.kpis.atRisk ?? 0, format: fmt$, color: "text-red-600" },
    { label: "Open Appeals", value: data?.kpis.openAppeals ?? 0, format: (v) => String(v) },
    { label: "Appeal Win Rate", value: data?.kpis.appealWinPct ?? 0, format: fmtPct, color: "text-green-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" /> BCBS Audit Status
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data?.payerLabel ?? "Blue Cross Blue Shield"} claim lifecycle, exposure, and appeal recovery.
        </p>
      </div>

      {/* Date Filters */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-sm w-36" data-testid="input-bcbs-date-from" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-sm w-36" data-testid="input-bcbs-date-to" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              {isLoading ? (
                <Skeleton className="h-7 w-20 mt-1" />
              ) : (
                <p className={`text-2xl font-bold mt-0.5 ${k.color ?? ""}`} data-testid={`kpi-${k.label}`}>
                  {k.format(k.value)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claims by Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (data?.byStatus || []).length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No BCBS claims found for this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.byStatus}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, name: string) => [name === "claimCount" ? v : fmt$(v), name]} />
                <Bar dataKey="claimCount" name="Claims" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Flagged Claims */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flagged Claims (Denied or Underpaid)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim #</TableHead>
                  <TableHead>DOS</TableHead>
                  <TableHead>CPT</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Underpaid</TableHead>
                  <TableHead>Denial Codes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.flaggedClaims || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6 text-sm">
                      No flagged BCBS claims.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.flaggedClaims || []).map((c) => (
                    <TableRow key={c.id} data-testid={`row-claim-${c.claimNumber}`}>
                      <TableCell className="font-mono text-sm">{c.claimNumber}</TableCell>
                      <TableCell className="text-sm">{c.dos}</TableCell>
                      <TableCell className="font-mono text-xs">{c.cptCodes || "—"}</TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_BADGE[c.status || ""] || "bg-muted text-muted-foreground"} text-xs`}>
                          {c.status || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmt$(c.billed)}</TableCell>
                      <TableCell className="text-right">{fmt$(c.paid)}</TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {c.underpaidAmount > 0 ? fmt$(c.underpaidAmount) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.denialCodes || "—"}</TableCell>
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
