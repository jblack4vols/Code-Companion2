import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stethoscope, MessageSquare, FileText, AlertTriangle, TrendingUp, Users, Activity, Filter, X, ClipboardList, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import type { Physician, Location } from "@shared/schema";
import { format, subMonths } from "date-fns";
import { getQueryFn } from "@/lib/queryClient";
import { useLocation } from "wouter";

function StatCard({ icon: Icon, label, value, sub, color, onClick }: { icon: any; label: string; value: string | number; sub?: string; color: string; onClick?: () => void }) {
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
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [startDate, setStartDate] = useState(format(subMonths(new Date(), 6), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [locationId, setLocationId] = useState("");
  const [physicianId, setPhysicianId] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (locationId) params.set("locationId", locationId);
  if (physicianId) params.set("physicianId", physicianId);
  const queryString = params.toString();

  const statsUrl = queryString ? `/api/dashboard/stats?${queryString}` : "/api/dashboard/stats";
  const { data: stats, isLoading: loadingStats } = useQuery<any>({
    queryKey: [statsUrl],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  const stageCounts = physicians?.reduce((acc, p) => {
    if (physicianId && p.id !== physicianId) return acc;
    acc[p.relationshipStage] = (acc[p.relationshipStage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const stageData = Object.entries(stageCounts).map(([name, value]) => ({
    name: name.replace(/_/g, " "),
    value,
    fill: stageColors[name] || "hsl(var(--chart-1))",
  }));

  const topReferrers = stats?.topReferrers?.map((r: any) => {
    const phys = physicians?.find(p => p.id === r.physicianId);
    return { name: phys ? `Dr. ${phys.lastName}` : "Unknown", count: Number(r.count) };
  }) || [];

  const referralTrendData = stats?.referralsByMonth?.map((r: any) => ({
    month: r.month,
    count: r.count,
  })) || [];

  const clearFilters = () => {
    setStartDate(format(subMonths(new Date(), 6), "yyyy-MM-dd"));
    setEndDate(format(new Date(), "yyyy-MM-dd"));
    setLocationId("");
    setPhysicianId("");
  };

  const hasActiveFilters = locationId || physicianId;

  if (loadingStats) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1,2,3,4,5].map(i => (
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

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Overview of your physician referral pipeline</p>
        </div>
        <div className="flex items-center gap-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <Label className="text-xs">Physician</Label>
                <Select value={physicianId} onValueChange={(v) => setPhysicianId(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="select-filter-physician">
                    <SelectValue placeholder="All Physicians" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Physicians</SelectItem>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          icon={Stethoscope}
          label="Active Physicians"
          value={stats?.activePhysicians || 0}
          sub={`${physicians?.length || 0} total`}
          color="bg-chart-1/15 text-chart-1"
          onClick={() => navigate("/physicians?status=ACTIVE")}
        />
        <StatCard
          icon={FileText}
          label="Total Referrals"
          value={stats?.totalReferrals || 0}
          color="bg-chart-2/15 text-chart-2"
          onClick={() => navigate("/referrals")}
        />
        <StatCard
          icon={MessageSquare}
          label="Interactions"
          value={stats?.totalInteractions || 0}
          color="bg-chart-3/15 text-chart-3"
          onClick={() => navigate("/interactions")}
        />
        <StatCard
          icon={AlertTriangle}
          label="At Risk"
          value={stats?.atRiskPhysicians || 0}
          color="bg-chart-5/15 text-chart-5"
          onClick={() => navigate("/physicians?stage=AT_RISK")}
        />
        <StatCard
          icon={ClipboardList}
          label="Open Tasks"
          value={stats?.openTasks || 0}
          color="bg-chart-4/15 text-chart-4"
          onClick={() => navigate("/tasks?status=OPEN")}
        />
      </div>

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
                <LineChart data={referralTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
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
              <h3 className="text-sm font-semibold">Top Referring Physicians</h3>
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
              <p className="text-xs text-muted-foreground">Physician distribution</p>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {stageData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={stageData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={60}>
                      {stageData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
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

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">At-Risk Physicians</h3>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </div>
            <AlertTriangle className="w-4 h-4 text-chart-5" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {physicians?.filter(p => p.relationshipStage === "AT_RISK").length ? (
              <div className="space-y-2">
                {physicians.filter(p => p.relationshipStage === "AT_RISK").slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer" onClick={() => navigate(`/physicians/${p.id}`)} data-testid={`card-at-risk-${p.id}`}>
                    <div className="w-8 h-8 rounded-md bg-chart-5/15 flex items-center justify-center text-chart-5 text-xs font-medium shrink-0">
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">Dr. {p.firstName} {p.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.practiceName}</p>
                    </div>
                    <Badge variant="outline" className="bg-chart-5/10 text-chart-5 text-[10px]">At Risk</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                No at-risk physicians
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
