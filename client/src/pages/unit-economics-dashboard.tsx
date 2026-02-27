/**
 * Unit Economics Dashboard — location heat map grid showing revenue/cost/margin metrics.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";

interface LocationSummary {
  locationId: string;
  locationName: string;
  grossRevenue: number;
  totalVisits: number;
  revenuePerVisit: number;
  costPerVisit: number;
  laborPercent: number;
  netMargin: number;
  netContribution: number;
  activeAlerts: number;
}

interface ForecastEntry {
  locationId: string;
  locationName: string;
  forecastRevenue: number;
  forecastVisits: number;
  forecastRevenuePerVisit: number;
  trendDirection: "up" | "down" | "flat";
  confidenceScore: number;
}

function metricColor(metric: string, value: number): string {
  const green = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  const yellow = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  const red = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  if (metric === "revenuePerVisit") return value >= 95 ? green : value >= 80 ? yellow : red;
  if (metric === "costPerVisit") return value <= 80 ? green : value <= 92 ? yellow : red;
  if (metric === "laborPercent") return value <= 50 ? green : value <= 57.5 ? yellow : red;
  if (metric === "netMargin") return value >= 15 ? green : value >= 5 ? yellow : red;
  return "";
}

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number) { return n.toFixed(1) + "%"; }

function TrendIcon({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up") return <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400 inline" />;
  if (dir === "down") return <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400 inline" />;
  return <Minus className="w-4 h-4 text-muted-foreground inline" />;
}

export default function UnitEconomicsDashboardPage() {
  const { data, isLoading, refetch } = useQuery<LocationSummary[]>({
    queryKey: ["/api/unit-economics/dashboard"],
  });

  const { data: forecasts } = useQuery<ForecastEntry[]>({
    queryKey: ["/api/unit-economics/forecast"],
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/unit-economics/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/unit-economics/forecast"] });
    refetch();
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-9 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  const locations = data || [];
  const totalRevenue = locations.reduce((s, l) => s + l.grossRevenue, 0);
  const avgRevenuePerVisit = locations.length > 0
    ? locations.reduce((s, l) => s + l.revenuePerVisit, 0) / locations.length : 0;
  const avgCostPerVisit = locations.length > 0
    ? locations.reduce((s, l) => s + l.costPerVisit, 0) / locations.length : 0;
  const totalAlerts = locations.reduce((s, l) => s + l.activeAlerts, 0);

  if (locations.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold mb-4">Unit Economics</h1>
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
            <DollarSign className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No financial data yet. Import data to get started.
            </p>
            <Link href="/unit-economics/import">
              <Button size="sm" variant="outline">Import Data</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="page-header">
        <div>
          <h1>Unit Economics</h1>
          <p className="page-subtitle">Financial performance across all locations</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-4/15 text-chart-4">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold mt-0.5">{fmt$(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Rev/Visit</p>
              <p className="text-2xl font-bold mt-0.5">{fmt$(avgRevenuePerVisit)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
              <Minus className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Cost/Visit</p>
              <p className="text-2xl font-bold mt-0.5">{fmt$(avgCostPerVisit)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${totalAlerts > 0 ? "bg-red-500/15 text-red-500" : "bg-chart-3/15 text-chart-3"}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Alerts</p>
              <p className="text-2xl font-bold mt-0.5">{totalAlerts}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Location heat map table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Location Performance (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Location</TableHead>
                  <TableHead>Rev/Visit</TableHead>
                  <TableHead>Cost/Visit</TableHead>
                  <TableHead>Labor %</TableHead>
                  <TableHead>Net Margin</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead>Net Contribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((loc) => (
                  <TableRow key={loc.locationId} data-testid={`row-location-${loc.locationId}`}>
                    <TableCell>
                      <Link href={`/unit-economics/location/${loc.locationId}`}>
                        <span className="font-medium hover:underline cursor-pointer text-primary">
                          {loc.locationName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={metricColor("revenuePerVisit", loc.revenuePerVisit)}>
                        {fmt$(loc.revenuePerVisit)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={metricColor("costPerVisit", loc.costPerVisit)}>
                        {fmt$(loc.costPerVisit)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={metricColor("laborPercent", loc.laborPercent)}>
                        {fmtPct(loc.laborPercent)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={metricColor("netMargin", loc.netMargin)}>
                        {fmtPct(loc.netMargin)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {loc.activeAlerts > 0 ? (
                        <Link href={`/unit-economics/alerts`}>
                          <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 cursor-pointer">
                            {loc.activeAlerts}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{fmt$(loc.netContribution)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Forecast section */}
      {forecasts && forecasts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue Forecast (4-Week Outlook)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Forecast Revenue</TableHead>
                    <TableHead>Forecast Visits</TableHead>
                    <TableHead>Rev/Visit</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecasts.map((f) => (
                    <TableRow key={f.locationId}>
                      <TableCell className="font-medium">{f.locationName}</TableCell>
                      <TableCell>{fmt$(f.forecastRevenue)}</TableCell>
                      <TableCell>{f.forecastVisits.toLocaleString()}</TableCell>
                      <TableCell>{fmt$(f.forecastRevenuePerVisit)}</TableCell>
                      <TableCell><TrendIcon dir={f.trendDirection} /></TableCell>
                      <TableCell>{f.confidenceScore}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
