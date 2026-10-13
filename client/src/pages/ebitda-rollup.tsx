/**
 * Practice-Wide EBITDA — aggregates clinic financials across all locations.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface EbitdaRollup {
  periodDate: string;
  totalGrossRevenue: number;
  totalExpenses: number;
  ebitda: number;
  ebitdaMargin: number;
  totalVisits: number;
  revenuePerVisit: number;
  locationCount: number;
}

const fmtMoney = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const fmtPct = (n: number) => `${n}%`;

function ebitdaClass(n: number): string {
  return n >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

function marginClass(m: number): string {
  if (m > 20) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (m >= 10) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

export default function EbitdaRollupPage() {
  const { data, isLoading } = useQuery<EbitdaRollup[]>({
    queryKey: ["/api/unit-economics/ebitda-rollup"],
  });

  const latest = data?.[0];

  return (
    <div className="p-6 space-y-6" data-testid="page-ebitda-rollup">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Practice-Wide EBITDA</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated across all locations{latest ? ` - latest period ${latest.periodDate}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !latest ? (
          [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Kpi label="Total Revenue" value={fmtMoney(latest.totalGrossRevenue)} testId="kpi-revenue" />
            <Kpi label="Total Expenses" value={fmtMoney(latest.totalExpenses)} testId="kpi-expenses" />
            <Kpi label="EBITDA" value={fmtMoney(latest.ebitda)} className={ebitdaClass(latest.ebitda)} testId="kpi-ebitda" />
            <Kpi
              label="EBITDA Margin"
              value={fmtPct(latest.ebitdaMargin)}
              className={ebitdaClass(latest.ebitdaMargin)}
              testId="kpi-margin"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">EBITDA by Period</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-empty">
              No financial data available for the selected period.
            </p>
          ) : (
            <Table data-testid="table-ebitda">
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">EBITDA</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Revenue/Visit</TableHead>
                  <TableHead className="text-right">Locations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(r => (
                  <TableRow key={r.periodDate} data-testid={`row-period-${r.periodDate}`}>
                    <TableCell>{r.periodDate}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.totalGrossRevenue)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.totalExpenses)}</TableCell>
                    <TableCell className={`text-right font-medium ${ebitdaClass(r.ebitda)}`}>{fmtMoney(r.ebitda)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className={marginClass(r.ebitdaMargin)}>{fmtPct(r.ebitdaMargin)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.totalVisits.toLocaleString("en-US")}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.revenuePerVisit)}</TableCell>
                    <TableCell className="text-right">{r.locationCount}</TableCell>
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

function Kpi({ label, value, className = "", testId }: { label: string; value: string; className?: string; testId: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${className}`} data-testid={testId}>{value}</div>
      </CardContent>
    </Card>
  );
}
