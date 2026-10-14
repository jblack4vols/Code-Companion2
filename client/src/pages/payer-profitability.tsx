/**
 * Payer Profitability Matrix — collection, denial, and speed-to-pay metrics per payer.
 * Gated to OWNER/DIRECTOR/ANALYST.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Grid3x3 } from "lucide-react";

interface PayerRow {
  payer: string;
  payerType: string | null;
  claimCount: number;
  totalBilled: number;
  totalPaid: number;
  collectionRate: number;
  denialRate: number;
  avgDaysToPay: number;
  netRevenuePerVisit: number;
}

const fmt$ = (n: number) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const collectionColor = (v: number) =>
  v > 80 ? "text-green-600" : v >= 60 ? "text-yellow-600" : "text-red-600";
const denialColor = (v: number) =>
  v < 5 ? "text-green-600" : v <= 10 ? "text-yellow-600" : "text-red-600";

export default function PayerProfitabilityPage() {
  const { data, isLoading } = useQuery<PayerRow[]>({
    queryKey: ["/api/revenue/payer-profitability"],
    queryFn: () =>
      fetch("/api/revenue/payer-profitability", { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Failed to load payer profitability");
        return r.json();
      }),
  });

  const rows = data ?? [];
  const best = rows.length ? rows.reduce((a, b) => (b.collectionRate > a.collectionRate ? b : a)) : null;
  const worst = rows.length ? rows.reduce((a, b) => (b.denialRate > a.denialRate ? b : a)) : null;
  const totalClaims = rows.reduce((s, r) => s + r.claimCount, 0);
  const avgDays = totalClaims
    ? Math.round(rows.reduce((s, r) => s + r.avgDaysToPay * r.claimCount, 0) / totalClaims)
    : 0;

  const kpis = [
    { id: "total-payers", label: "Total Payers", value: String(rows.length), sub: "" },
    { id: "best-collection", label: "Best Collection Rate", value: best ? `${best.collectionRate}%` : "—", sub: best?.payer ?? "" },
    { id: "worst-denial", label: "Worst Denial Rate", value: worst ? `${worst.denialRate}%` : "—", sub: worst?.payer ?? "" },
    { id: "avg-days", label: "Avg Days to Pay", value: String(avgDays), sub: "claim-weighted" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
          <Grid3x3 className="w-6 h-6" /> Payer Profitability Matrix
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Compare payers by collection rate, denial rate, and time to payment.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.id} data-testid={`card-kpi-${k.id}`}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-20" /> : (
                <>
                  <div className="text-2xl font-bold" data-testid={`text-kpi-${k.id}`}>{k.value}</div>
                  {k.sub && <p className="text-xs text-muted-foreground truncate">{k.sub}</p>}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Payers</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40 w-full" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Claims</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Collection %</TableHead>
                  <TableHead className="text-right">Denial %</TableHead>
                  <TableHead className="text-right">Avg Days to Pay</TableHead>
                  <TableHead className="text-right">Revenue/Visit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={`${r.payer}-${r.payerType}`} data-testid={`row-payer-${r.payer}`}>
                    <TableCell className="font-medium">{r.payer}</TableCell>
                    <TableCell>{r.payerType ? <Badge variant="secondary">{r.payerType}</Badge> : "—"}</TableCell>
                    <TableCell className="text-right">{r.claimCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{fmt$(r.totalBilled)}</TableCell>
                    <TableCell className="text-right">{fmt$(r.totalPaid)}</TableCell>
                    <TableCell className={`text-right font-medium ${collectionColor(r.collectionRate)}`}>{r.collectionRate}%</TableCell>
                    <TableCell className={`text-right font-medium ${denialColor(r.denialRate)}`}>{r.denialRate}%</TableCell>
                    <TableCell className="text-right">{r.avgDaysToPay}</TableCell>
                    <TableCell className="text-right">{fmt$(r.netRevenuePerVisit)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No claims data available.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
