/**
 * Unit Economics Location Detail — time series charts, providers, and alerts for one location.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, DollarSign, TrendingUp, TrendingDown, Percent, Activity, Bell } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface TrendPoint {
  periodDate: string;
  grossRevenue: number;
  totalVisits: number;
  revenuePerVisit: number;
  costPerVisit: number;
  laborPercent: number;
  netContribution: number;
}

interface ProviderEntry {
  userId: string;
  userName: string;
  locationName: string;
  totalVisits: number;
  totalUnits: number;
  unitsPerHour: number;
  hoursWorked: number;
  revenueGenerated: number;
  revenueTarget: number;
  targetAttainment: number;
}

interface LocationSummary {
  revenuePerVisit: number;
  costPerVisit: number;
  laborPercent: number;
  netMargin: number;
  netContribution: number;
}

interface LocationDetail {
  location: { id: string; name: string; city: string; state: string };
  currentPeriod: LocationSummary | null;
  trends: TrendPoint[];
  providers: ProviderEntry[];
}

interface FinancialAlert {
  id: string;
  locationId: string;
  alertType: string;
  metricName: string;
  metricValue: string;
  thresholdValue: string;
  severity: string;
  triggeredAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number) { return n.toFixed(1) + "%"; }

function KpiCard({ label, value, icon: Icon, colorClass }: {
  label: string; value: string; icon: React.ElementType; colorClass: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold mt-0.5">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function targetColor(pct: number): string {
  if (pct >= 100) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (pct >= 80) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

function severityColor(s: string) {
  if (s === "CRITICAL") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (s === "WARNING") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
}

export default function UnitEconomicsLocationDetailPage() {
  const [match, params] = useRoute("/unit-economics/location/:id");
  if (!match) return null;
  const locationId = params!.id;
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<LocationDetail>({
    queryKey: ["/api/unit-economics/location", locationId],
    queryFn: async () => {
      const res = await fetch(`/api/unit-economics/location/${locationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load location data");
      return res.json();
    },
  });

  const { data: alerts } = useQuery<FinancialAlert[]>({
    queryKey: ["/api/unit-economics/alerts", locationId],
    queryFn: async () => {
      const res = await fetch(`/api/unit-economics/alerts?locationId=${locationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load alerts");
      return res.json();
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await apiRequest("POST", `/api/unit-economics/alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unit-economics/alerts", locationId] });
      toast({ title: "Alert acknowledged" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <Link href="/unit-economics">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </Link>
        <p className="text-sm text-destructive">Failed to load location data.</p>
      </div>
    );
  }

  const { location, currentPeriod, trends, providers } = data;

  const trendChartData = trends.map((t) => ({
    period: t.periodDate,
    "Rev/Visit": t.revenuePerVisit,
    "Cost/Visit": t.costPerVisit,
    "Net Contribution": t.netContribution,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/unit-economics">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{location.name}</h1>
          {location.city && (
            <p className="text-xs text-muted-foreground">{location.city}, {location.state}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard label="Rev/Visit" value={fmt$(currentPeriod?.revenuePerVisit ?? 0)} icon={TrendingUp} colorClass="bg-chart-4/15 text-chart-4" />
        <KpiCard label="Cost/Visit" value={fmt$(currentPeriod?.costPerVisit ?? 0)} icon={TrendingDown} colorClass="bg-chart-2/15 text-chart-2" />
        <KpiCard label="Labor %" value={fmtPct(currentPeriod?.laborPercent ?? 0)} icon={Percent} colorClass="bg-chart-1/15 text-chart-1" />
        <KpiCard label="Net Margin" value={fmtPct(currentPeriod?.netMargin ?? 0)} icon={Activity} colorClass="bg-chart-3/15 text-chart-3" />
        <KpiCard label="Net Contribution" value={fmt$(currentPeriod?.netContribution ?? 0)} icon={DollarSign} colorClass="bg-chart-5/15 text-chart-5" />
      </div>

      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue vs Cost Per Visit</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number) => fmt$(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="Rev/Visit" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Cost/Visit" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">No trend data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Net Contribution Over Time</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number) => fmt$(v)} />
                    <Bar dataKey="Net Contribution" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Provider Productivity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {providers.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No provider data for this location
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Visits</TableHead>
                        <TableHead>Units</TableHead>
                        <TableHead>Units/Hr</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Target %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providers.map((p) => (
                        <TableRow key={p.userId}>
                          <TableCell className="font-medium">{p.userName}</TableCell>
                          <TableCell>{p.totalVisits.toLocaleString()}</TableCell>
                          <TableCell>{p.totalUnits.toLocaleString()}</TableCell>
                          <TableCell>{p.unitsPerHour.toFixed(1)}</TableCell>
                          <TableCell>{fmt$(p.revenueGenerated)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={targetColor(p.targetAttainment)}>
                              {p.targetAttainment.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Alerts for This Location</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {!alerts || alerts.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                  No alerts for this location
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`flex items-start gap-3 p-3 rounded-md border ${alert.acknowledgedAt ? "opacity-50" : ""}`}
                    >
                      <Bell className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={severityColor(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          <span className="text-sm font-medium">{alert.metricName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Value: ${parseFloat(alert.metricValue).toFixed(2)} — Threshold: ${parseFloat(alert.thresholdValue).toFixed(2)}
                        </p>
                        {alert.triggeredAt && (
                          <p className="text-xs text-muted-foreground">
                            Triggered: {format(new Date(alert.triggeredAt), "MMM d, yyyy")}
                          </p>
                        )}
                        {alert.acknowledgedAt && (
                          <p className="text-xs text-muted-foreground">
                            Acknowledged: {format(new Date(alert.acknowledgedAt), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                      {!alert.acknowledgedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
