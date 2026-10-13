/**
 * Marketer ROI Dashboard — revenue attribution and ROI per marketer.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MarketerRoiRow {
  marketerId: string;
  marketerName: string;
  annualCompensation: number | null;
  travelBudget: number | null;
  totalCost: number;
  assignedPhysicians: number;
  totalReferrals: number;
  totalRevenue: number;
  revenuePerReferral: number;
  roi: number | null;
}

const fmtMoney = (n: number | null) => (n === null ? "-" : `$${Math.round(n).toLocaleString("en-US")}`);

function roiClass(roi: number | null): string {
  if (roi === null) return "bg-muted text-muted-foreground";
  if (roi > 5) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (roi >= 2) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

export default function MarketerRoiDashboardPage() {
  const { data, isLoading } = useQuery<MarketerRoiRow[]>({ queryKey: ["/api/marketer-roi"] });

  const rows = data ?? [];
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const withRoi = rows.filter(r => r.roi !== null);
  const avgRoi = withRoi.length ? withRoi.reduce((s, r) => s + (r.roi ?? 0), 0) / withRoi.length : null;
  const missingCost = rows.some(r => r.roi === null);

  return (
    <div className="p-6 space-y-6" data-testid="page-marketer-roi">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Marketer ROI Dashboard</h1>
        <p className="text-sm text-muted-foreground">Revenue attribution and ROI analysis per marketer</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          [0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Kpi label="Total Marketers" value={String(rows.length)} testId="kpi-marketers" />
            <Kpi label="Total Revenue Generated" value={fmtMoney(totalRevenue)} testId="kpi-revenue" />
            <Kpi label="Average ROI" value={avgRoi === null ? "-" : `${avgRoi.toFixed(1)}x`} testId="kpi-avg-roi" />
          </>
        )}
      </div>

      {missingCost && !isLoading && (
        <p className="text-sm text-muted-foreground" data-testid="text-missing-comp">
          Add compensation data to users to calculate ROI
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marketer Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-empty">No marketers found.</p>
          ) : (
            <Table data-testid="table-marketer-roi">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Compensation</TableHead>
                  <TableHead className="text-right">Travel Budget</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Physicians</TableHead>
                  <TableHead className="text-right">Referrals</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Revenue/Referral</TableHead>
                  <TableHead className="text-right">ROI (x)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.marketerId} data-testid={`row-marketer-${r.marketerId}`}>
                    <TableCell className="font-medium">{r.marketerName}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.annualCompensation)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.travelBudget)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.totalCost)}</TableCell>
                    <TableCell className="text-right">{r.assignedPhysicians}</TableCell>
                    <TableCell className="text-right">{r.totalReferrals.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.revenuePerReferral)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className={roiClass(r.roi)} data-testid={`badge-roi-${r.marketerId}`}>
                        {r.roi === null ? "N/A" : `${r.roi}x`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={testId}>{value}</div>
      </CardContent>
    </Card>
  );
}
