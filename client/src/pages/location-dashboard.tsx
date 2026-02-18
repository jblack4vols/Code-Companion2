import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FileText, Users, DollarSign, AlertTriangle, Activity, MapPin } from "lucide-react";
import { format, subMonths } from "date-fns";
import type { Location, Physician } from "@shared/schema";

function generateMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    options.push({ value: format(d, "yyyy-MM-01"), label: format(d, "MMMM yyyy") });
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

function riskColor(score: number): string {
  if (score < 0.3) return "bg-chart-4/15 text-chart-4";
  if (score < 0.6) return "bg-chart-3/15 text-chart-3";
  return "bg-chart-5/15 text-chart-5";
}

export default function LocationDashboardPage() {
  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]?.value || monthOptions[0].value);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const { data: locations, isLoading: loadingLocations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: physicians } = useQuery<Physician[]>({
    queryKey: ["/api/physicians"],
  });

  const { data: locationData, isLoading: loadingLocation } = useQuery<any>({
    queryKey: ["/api/dashboard/location", selectedLocationId, { month: selectedMonth }],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/location/${selectedLocationId}?month=${selectedMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch location data");
      return res.json();
    },
    enabled: !!selectedLocationId,
  });

  const physicianMap = new Map<string, Physician>();
  physicians?.forEach((p) => physicianMap.set(p.id, p));

  const summaries = locationData?.summaries || [];
  const latestSummary = summaries[0] || null;

  const trendData = summaries
    .slice()
    .sort((a: any, b: any) => a.month.localeCompare(b.month))
    .map((s: any) => ({
      month: format(new Date(s.month), "MMM yy"),
      referrals: s.referralsCount,
      visits: s.totalVisits,
    }));

  const topReferrersForLocation = (locationData?.topReferrers || []).slice(0, 10);

  const activeLocations = locations?.filter((l) => l.isActive) || [];

  if (loadingLocations) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-location-dashboard-title">Location Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Performance metrics by location</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="w-[220px]" data-testid="select-location-filter">
              <SelectValue placeholder="Select Location" />
            </SelectTrigger>
            <SelectContent>
              {activeLocations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </div>

      {!selectedLocationId ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <MapPin className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">Select a location to view performance metrics</p>
            </div>
          </CardContent>
        </Card>
      ) : loadingLocation ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card data-testid="card-location-referrals">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Referrals</p>
                  <p className="text-2xl font-bold mt-0.5">{(latestSummary?.referralsCount || 0).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-location-visits">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Total Visits</p>
                  <p className="text-2xl font-bold mt-0.5">{(latestSummary?.totalVisits || 0).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-location-revenue">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-4/15 text-chart-4">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Revenue</p>
                  <p className="text-2xl font-bold mt-0.5">{formatCurrency(latestSummary?.revenueTotal || 0)}</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-location-dependency">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${riskColor(latestSummary?.referralDependencyRatio || 0)}`}>
                  <Activity className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Dependency Ratio</p>
                  <p className="text-2xl font-bold mt-0.5">{formatPercent(latestSummary?.referralDependencyRatio || 0)}</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-location-risk">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${riskColor(latestSummary?.riskScore || 0)}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Risk Score</p>
                  <p className="text-2xl font-bold mt-0.5">{(latestSummary?.riskScore || 0).toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div>
                <h3 className="text-sm font-semibold">Monthly Trends</h3>
                <p className="text-xs text-muted-foreground">Referrals and visits over time</p>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="referrals" name="Referrals" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="visits" name="Visits" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                  No trend data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-semibold">Top Referral Sources</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {topReferrersForLocation.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No referral source data for this month
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Physician</TableHead>
                        <TableHead>Referrals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topReferrersForLocation.map((r: any, idx: number) => {
                        const phys = physicianMap.get(r.physicianId);
                        const displayName = phys ? `Dr. ${phys.firstName} ${phys.lastName}` : r.name || "Unknown";
                        return (
                          <TableRow key={r.physicianId || idx} data-testid={`row-location-referrer-${idx}`}>
                            <TableCell className="text-sm font-medium">{displayName}</TableCell>
                            <TableCell className="text-sm">{r.count}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
