import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stethoscope, MessageSquare, FileText, AlertTriangle, TrendingUp, Users, Activity, Filter, X, ClipboardList, ChevronRight, ArrowUpRight, ArrowDownRight, Minus, GitCompare, Percent, Clock, BarChart3, RefreshCw, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Funnel, FunnelChart, LabelList } from "recharts";
import type { Physician, Location, Territory } from "@shared/schema";
import { format, subMonths, differenceInDays, subDays, startOfQuarter, startOfYear } from "date-fns";
import { getQueryFn } from "@/lib/queryClient";
import { useLocation } from "wouter";

function StatCard({ icon: Icon, label, value, sub, color, onClick, prevValue }: { icon: any; label: string; value: string | number; sub?: string; color: string; onClick?: () => void; prevValue?: number | null }) {
  const numVal = typeof value === "number" ? value : parseInt(String(value), 10);
  const showChange = prevValue != null && !isNaN(numVal);
  let changePercent = 0;
  if (showChange && prevValue > 0) {
    changePercent = Math.round(((numVal - prevValue) / prevValue) * 100);
  } else if (showChange && prevValue === 0 && numVal > 0) {
    changePercent = 100;
  }

  return (
    <Card
      className={onClick ? "cursor-pointer hover-elevate" : ""}
      onClick={onClick}
      data-testid={`card-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
          {showChange && (
            <div className={`flex items-center gap-1 mt-0.5 text-xs ${changePercent > 0 ? "text-green-600 dark:text-green-400" : changePercent < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} data-testid={`text-change-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              {changePercent > 0 ? <ArrowUpRight className="w-3 h-3" /> : changePercent < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {Math.abs(changePercent)}% vs prev period ({prevValue})
            </div>
          )}
          {!showChange && sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {onClick && <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />}
      </CardContent>
    </Card>
  );
}

const stageColors: Record<string, string> = {
  NEW: "hsl(var(--chart-1))",
  DEVELOPING: "hsl(var(--chart-2))",
  STRONG: "hsl(var(--chart-4))",
  AT_RISK: "hsl(var(--chart-5))",
};

const DATE_PRESETS = [
  { label: "30 Days", getRange: () => ({ start: format(subDays(new Date(), 30), "yyyy-MM-dd"), end: format(new Date(), "yyyy-MM-dd") }) },
  { label: "Quarter", getRange: () => ({ start: format(startOfQuarter(new Date()), "yyyy-MM-dd"), end: format(new Date(), "yyyy-MM-dd") }) },
  { label: "YTD", getRange: () => ({ start: format(startOfYear(new Date()), "yyyy-MM-dd"), end: format(new Date(), "yyyy-MM-dd") }) },
  { label: "12 Months", getRange: () => ({ start: format(subMonths(new Date(), 12), "yyyy-MM-dd"), end: format(new Date(), "yyyy-MM-dd") }) },
];

function useUrlFilters() {
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  return {
    startDate: urlParams.get("startDate") || format(subMonths(new Date(), 6), "yyyy-MM-dd"),
    endDate: urlParams.get("endDate") || format(new Date(), "yyyy-MM-dd"),
    locationId: urlParams.get("locationId") || "",
    territoryId: urlParams.get("territoryId") || "",
    physicianId: urlParams.get("physicianId") || "",
  };
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const defaults = useUrlFilters();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [locationId, setLocationId] = useState(defaults.locationId);
  const [territoryId, setTerritoryId] = useState(defaults.territoryId);
  const [physicianId, setPhysicianId] = useState(defaults.physicianId);
  const [showFilters, setShowFilters] = useState(false);
  const [comparePeriod, setComparePeriod] = useState(false);

  useMemo(() => {
    const p = new URLSearchParams();
    if (startDate !== format(subMonths(new Date(), 6), "yyyy-MM-dd")) p.set("startDate", startDate);
    if (endDate !== format(new Date(), "yyyy-MM-dd")) p.set("endDate", endDate);
    if (locationId) p.set("locationId", locationId);
    if (territoryId) p.set("territoryId", territoryId);
    if (physicianId) p.set("physicianId", physicianId);
    const qs = p.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (window.location.search !== (qs ? `?${qs}` : "")) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [startDate, endDate, locationId, territoryId, physicianId]);

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (locationId) params.set("locationId", locationId);
  if (territoryId) params.set("territoryId", territoryId);
  if (physicianId) params.set("physicianId", physicianId);
  const queryString = params.toString();

  const statsUrl = queryString ? `/api/dashboard/stats?${queryString}` : "/api/dashboard/stats";
  const { data: stats, isLoading: loadingStats, isError: statsError, refetch: refetchStats, dataUpdatedAt } = useQuery<any>({
    queryKey: [statsUrl],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const daySpan = Math.max(differenceInDays(new Date(endDate), new Date(startDate)), 1);
  const prevEnd = format(subDays(new Date(startDate), 1), "yyyy-MM-dd");
  const prevStart = format(subDays(new Date(startDate), daySpan), "yyyy-MM-dd");
  const prevParams = new URLSearchParams();
  prevParams.set("startDate", prevStart);
  prevParams.set("endDate", prevEnd);
  if (locationId) prevParams.set("locationId", locationId);
  if (territoryId) prevParams.set("territoryId", territoryId);
  if (physicianId) prevParams.set("physicianId", physicianId);

  const { data: prevStats } = useQuery<any>({
    queryKey: [`/api/dashboard/stats?${prevParams.toString()}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: comparePeriod,
  });

  const funnelUrl = queryString ? `/api/dashboard/funnel?${queryString}` : "/api/dashboard/funnel";
  const { data: funnelData } = useQuery<any[]>({
    queryKey: [funnelUrl],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: territories } = useQuery<Territory[]>({ queryKey: ["/api/territories"] });

  const stageData = useMemo(() => {
    const stageCounts = physicians?.reduce((acc, p) => {
      if (physicianId && p.id !== physicianId) return acc;
      acc[p.relationshipStage] = (acc[p.relationshipStage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    return Object.entries(stageCounts).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value,
      fill: stageColors[name] || "hsl(var(--chart-1))",
    }));
  }, [physicians, physicianId]);

  const topReferrers = useMemo(() => {
    return stats?.topReferrers?.map((r: any) => {
      const phys = physicians?.find(p => p.id === r.physicianId);
      return { name: phys ? `Dr. ${phys.lastName}` : "Unknown", count: Number(r.count) };
    }) || [];
  }, [stats?.topReferrers, physicians]);

  const referralTrendData = useMemo(() => {
    return stats?.referralsByMonth?.map((r: any) => ({
      month: r.month,
      count: r.count,
    })) || [];
  }, [stats?.referralsByMonth]);

  const clearFilters = () => {
    setStartDate(format(subMonths(new Date(), 6), "yyyy-MM-dd"));
    setEndDate(format(new Date(), "yyyy-MM-dd"));
    setLocationId("");
    setTerritoryId("");
    setPhysicianId("");
  };

  const applyPreset = (preset: typeof DATE_PRESETS[number]) => {
    const range = preset.getRange();
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const hasActiveFilters = locationId || territoryId || physicianId;

  if (loadingStats) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[1,2,3,4,5,6,7,8].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground mb-3" data-testid="text-dashboard-error">Failed to load dashboard data</p>
            <Button variant="outline" size="sm" onClick={() => refetchStats()} data-testid="button-retry-dashboard">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs sm:text-sm text-muted-foreground">Overview of your referring provider pipeline</p>
            {dataUpdatedAt > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid="text-last-updated">
                <Clock className="w-3 h-3" />
                Updated {format(new Date(dataUpdatedAt), "h:mm a")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border rounded-md p-0.5" data-testid="group-date-presets">
            {DATE_PRESETS.map((p) => (
              <Button key={p.label} variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => applyPreset(p)} data-testid={`button-preset-${p.label.toLowerCase().replace(/\s/g, '-')}`}>
                {p.label}
              </Button>
            ))}
          </div>
          <Button
            variant={comparePeriod ? "secondary" : "outline"}
            size="sm"
            onClick={() => setComparePeriod(!comparePeriod)}
            className="toggle-elevate"
            data-testid="button-compare-period"
          >
            <GitCompare className="w-4 h-4 mr-1" />
            Compare
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-4 h-4 mr-1" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">Active</Badge>
            )}
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-filter-start-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  data-testid="input-filter-end-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location</Label>
                <Select value={locationId} onValueChange={(v) => setLocationId(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="select-filter-location">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations?.filter(l => l.isActive).map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Territory</Label>
                <Select value={territoryId} onValueChange={(v) => setTerritoryId(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="select-filter-territory">
                    <SelectValue placeholder="All Territories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Territories</SelectItem>
                    {territories?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Referring Provider</Label>
                <Select value={physicianId} onValueChange={(v) => setPhysicianId(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="select-filter-physician">
                    <SelectValue placeholder="All Referring Providers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Referring Providers</SelectItem>
                    {physicians?.map(p => (
                      <SelectItem key={p.id} value={p.id}>Dr. {p.lastName}, {p.firstName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {comparePeriod && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2" data-testid="text-compare-info">
          Comparing {startDate} to {endDate} vs previous period {prevStart} to {prevEnd}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Stethoscope}
          label="Active Providers (90d)"
          value={stats?.activePhysicians || 0}
          sub={`${physicians?.length || 0} total in system`}
          color="bg-chart-1/15 text-chart-1"
          onClick={() => navigate("/physicians")}
          prevValue={comparePeriod && prevStats ? prevStats.activePhysicians : null}
        />
        <StatCard
          icon={FileText}
          label="Total Referrals"
          value={stats?.totalReferrals || 0}
          color="bg-chart-2/15 text-chart-2"
          onClick={() => navigate("/referrals")}
          prevValue={comparePeriod && prevStats ? prevStats.totalReferrals : null}
        />
        <StatCard
          icon={MessageSquare}
          label="Interactions"
          value={stats?.totalInteractions || 0}
          color="bg-chart-3/15 text-chart-3"
          onClick={() => navigate("/interactions")}
          prevValue={comparePeriod && prevStats ? prevStats.totalInteractions : null}
        />
        <StatCard
          icon={AlertTriangle}
          label="At Risk"
          value={stats?.atRiskPhysicians || 0}
          color="bg-chart-5/15 text-chart-5"
          onClick={() => navigate("/physicians?stage=AT_RISK")}
          prevValue={comparePeriod && prevStats ? prevStats.atRiskPhysicians : null}
        />
        <StatCard
          icon={Percent}
          label="Conversion Rate"
          value={`${stats?.conversionRate || 0}%`}
          sub="Referrals with arrived visits"
          color="bg-green-500/15 text-green-600 dark:text-green-400"
          prevValue={comparePeriod && prevStats ? prevStats.conversionRate : null}
        />
        <StatCard
          icon={Clock}
          label="Avg Days to Visit"
          value={stats?.avgTimeToFirstVisit != null ? stats.avgTimeToFirstVisit : "—"}
          sub="Referral to first arrived visit"
          color="bg-blue-500/15 text-blue-600 dark:text-blue-400"
          prevValue={comparePeriod && prevStats ? prevStats.avgTimeToFirstVisit : null}
        />
        <StatCard
          icon={BarChart3}
          label="MoM Growth"
          value={`${stats?.momGrowth > 0 ? '+' : ''}${stats?.momGrowth || 0}%`}
          sub="Referrals vs prior month"
          color={`${(stats?.momGrowth || 0) >= 0 ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}`}
        />
        <StatCard
          icon={ClipboardList}
          label="Open Tasks"
          value={stats?.openTasks || 0}
          color="bg-chart-4/15 text-chart-4"
          onClick={() => navigate("/tasks?status=OPEN")}
          prevValue={comparePeriod && prevStats ? prevStats.openTasks : null}
        />
      </div>

      {funnelData && funnelData.some((d: any) => d.count > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold" data-testid="text-funnel-title">Conversion Funnel</h3>
              <p className="text-xs text-muted-foreground">Referral pipeline progression</p>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {funnelData.map((stage: any, i: number) => {
                const prevCount = i > 0 ? funnelData[i - 1].count : stage.count;
                const dropRate = prevCount > 0 && i > 0 ? Math.round(((prevCount - stage.count) / prevCount) * 100) : 0;
                const colors = ["bg-chart-1/15 text-chart-1", "bg-chart-2/15 text-chart-2", "bg-chart-4/15 text-chart-4", "bg-green-500/15 text-green-600 dark:text-green-400"];
                return (
                  <div key={stage.stage} className="text-center" data-testid={`funnel-stage-${stage.stage.toLowerCase()}`}>
                    <div className={`rounded-lg p-3 sm:p-4 ${colors[i] || colors[0]}`}>
                      <p className="text-xl sm:text-2xl font-bold">{stage.count}</p>
                      <p className="text-[11px] sm:text-xs font-medium mt-1">{stage.stage}</p>
                    </div>
                    {i > 0 && dropRate > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">-{dropRate}% drop</p>
                    )}
                    {i === 0 && <p className="text-[10px] text-muted-foreground mt-1">Starting</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Referral Trends</h3>
              <p className="text-xs text-muted-foreground">Monthly referral volume</p>
            </div>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {referralTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={referralTrendData} onClick={(data) => {
                  if (data?.activePayload?.[0]?.payload?.month) {
                    const m = data.activePayload[0].payload.month;
                    navigate(`/referrals?month=${m}`);
                  }
                }} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                No referral data for this period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Top Referring Providers</h3>
              <p className="text-xs text-muted-foreground">By referral count</p>
            </div>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {topReferrers.length > 0 && topReferrers.some((r: any) => r.count > 0) ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topReferrers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                No referral data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Relationship Stages</h3>
              <p className="text-xs text-muted-foreground">Provider distribution</p>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {stageData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={stageData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={60}
                      onClick={(_, index) => {
                        const stage = stageData[index]?.name?.replace(/ /g, "_");
                        if (stage) navigate(`/physicians?stage=${stage}`);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {stageData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {stageData.map(s => (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.fill }} />
                      <span className="flex-1">{s.name}</span>
                      <span className="font-medium">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                No data
              </div>
            )}
          </CardContent>
        </Card>

        <AtRiskReferralSourcesCard locationId={locationId} territoryId={territoryId} navigate={navigate} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <p className="text-xs text-muted-foreground">Latest team actions</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/activity")} data-testid="button-view-all-activity">
            View All
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <ActivityFeed limit={5} />
        </CardContent>
      </Card>
    </div>
  );
}

function AtRiskReferralSourcesCard({ locationId, territoryId, navigate }: { locationId: string; territoryId: string; navigate: (to: string) => void }) {
  const atRiskParams = new URLSearchParams();
  if (locationId) atRiskParams.set("locationId", locationId);
  if (territoryId) atRiskParams.set("territoryId", territoryId);
  const atRiskQs = atRiskParams.toString();
  const atRiskUrl = atRiskQs ? `/api/at-risk-sources?${atRiskQs}` : "/api/at-risk-sources";

  const { data: atRiskData } = useQuery<any>({
    queryKey: [atRiskUrl],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const items = atRiskData?.data || [];
  const total = atRiskData?.total || 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div>
          <h3 className="text-sm font-semibold" data-testid="text-at-risk-title">At-Risk Referral Sources</h3>
          <p className="text-xs text-muted-foreground">
            {total > 0 ? `${total} provider${total !== 1 ? "s" : ""} need attention` : "No at-risk providers detected"}
          </p>
        </div>
        <AlertTriangle className="w-4 h-4 text-chart-5" />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.slice(0, 10).map((item: any) => {
              const phys = item.physician;
              if (!phys) return null;
              return (
                <div
                  key={phys.id}
                  className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => navigate(`/physicians/${phys.id}`)}
                  data-testid={`card-at-risk-${phys.id}`}
                >
                  <div className="w-8 h-8 rounded-md bg-chart-5/15 flex items-center justify-center text-chart-5 text-xs font-medium shrink-0">
                    {phys.firstName?.[0]}{phys.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">Dr. {phys.firstName} {phys.lastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{phys.practiceName}</p>
                  </div>
                  <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] shrink-0">
                    {item.changePercent}%
                  </Badge>
                  <Badge variant="outline" className="bg-chart-5/10 text-chart-5 text-[10px] shrink-0">
                    {item.riskSignal === "no_contact"
                      ? `No contact ${item.daysSinceContact ? `${item.daysSinceContact}d` : ""}`
                      : "Overdue task"}
                  </Badge>
                </div>
              );
            })}
            {total > 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => navigate("/physicians?stage=AT_RISK")}
                data-testid="button-view-all-at-risk"
              >
                View all {total} at-risk sources
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
            No at-risk referral sources detected
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ limit = 15 }: { limit?: number }) {
  const [, navigate] = useLocation();
  const { data: rawActivities, isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/activity-feed?limit=15"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const activities = rawActivities?.slice(0, limit);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="w-8 h-8 rounded-md shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-40 flex flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground mb-3" data-testid="text-activity-error">Failed to load activity feed</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-activity">
          Retry
        </Button>
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
        No recent activity
      </div>
    );
  }

  const getActivityLink = (activity: any): string | null => {
    switch (activity.activity_type) {
      case "referral":
        return "/referrals";
      case "interaction":
        return "/interactions";
      case "task":
        return "/tasks";
      default:
        return null;
    }
  };

  return (
    <div className="max-h-[400px] overflow-auto space-y-2">
      {activities.map(activity => {
        let icon: any;
        let colorClass: string;
        let description: string;

        switch (activity.activity_type) {
          case "interaction":
            icon = MessageSquare;
            colorClass = "bg-chart-2/15 text-chart-2";
            description = `${activity.user_name} logged a ${activity.type?.toLowerCase() || 'contact'} with Dr. ${activity.physician_last_name}`;
            break;
          case "task":
            icon = ClipboardList;
            colorClass = "bg-chart-4/15 text-chart-4";
            description = `${activity.user_name} completed: ${activity.summary}`;
            break;
          case "referral":
            icon = FileText;
            colorClass = "bg-chart-1/15 text-chart-1";
            description = `New referral from ${activity.physician_name} at ${activity.location_name}`;
            break;
          default:
            icon = Activity;
            colorClass = "bg-muted/50 text-muted-foreground";
            description = "Unknown activity";
        }

        const IconComponent = icon;
        const timestamp = format(new Date(activity.timestamp), "MMM d, h:mm a");
        const link = getActivityLink(activity);

        return (
          <div
            key={activity.id}
            className={`flex items-start gap-3 p-2 rounded-md hover-elevate ${link ? "cursor-pointer" : ""}`}
            onClick={() => link && navigate(link)}
            data-testid={`activity-item-${activity.id}`}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${colorClass}`}>
              <IconComponent className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{description}</p>
              <p className="text-xs text-muted-foreground">{timestamp}</p>
            </div>
            {link && <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}
