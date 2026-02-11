import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Stethoscope, MessageSquare, FileText, AlertTriangle, TrendingUp, Users, Calendar, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import type { Physician, Referral, Interaction, Task } from "@shared/schema";
import { format, subDays, startOfMonth, isAfter } from "date-fns";

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Card data-testid={`card-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-md ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
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
  const { data: physicians, isLoading: loadingPhys } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: referrals, isLoading: loadingRefs } = useQuery<Referral[]>({ queryKey: ["/api/referrals"] });
  const { data: interactions, isLoading: loadingInts } = useQuery<Interaction[]>({ queryKey: ["/api/interactions"] });
  const { data: tasks } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });

  const isLoading = loadingPhys || loadingRefs || loadingInts;

  const activePhysicians = physicians?.filter(p => p.status === "ACTIVE").length || 0;
  const totalReferrals = referrals?.length || 0;
  const totalInteractions = interactions?.length || 0;
  const atRiskCount = physicians?.filter(p => p.relationshipStage === "AT_RISK").length || 0;
  const openTasks = tasks?.filter(t => t.status === "OPEN").length || 0;

  const stageCounts = physicians?.reduce((acc, p) => {
    acc[p.relationshipStage] = (acc[p.relationshipStage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const stageData = Object.entries(stageCounts).map(([name, value]) => ({
    name: name.replace(/_/g, " "),
    value,
    fill: stageColors[name] || "hsl(var(--chart-1))",
  }));

  const referralsByMonth = referrals?.reduce((acc, r) => {
    const month = format(new Date(r.referralDate), "MMM yyyy");
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const referralTrendData = Object.entries(referralsByMonth)
    .slice(-6)
    .map(([month, count]) => ({ month, count }));

  const topReferrers = physicians
    ?.map(p => ({
      name: `Dr. ${p.lastName}`,
      count: referrals?.filter(r => r.physicianId === p.id).length || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your physician referral pipeline</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Stethoscope} label="Active Physicians" value={activePhysicians} sub={`${physicians?.length || 0} total`} color="bg-chart-1/15 text-chart-1" />
        <StatCard icon={FileText} label="Total Referrals" value={totalReferrals} color="bg-chart-2/15 text-chart-2" />
        <StatCard icon={MessageSquare} label="Interactions" value={totalInteractions} color="bg-chart-3/15 text-chart-3" />
        <StatCard icon={AlertTriangle} label="At Risk" value={atRiskCount} sub={`${openTasks} open tasks`} color="bg-chart-5/15 text-chart-5" />
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
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                No referral data yet
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
            {topReferrers.length > 0 && topReferrers.some(r => r.count > 0) ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topReferrers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
                No referral data yet
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
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.fill }} />
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
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-md hover-elevate" data-testid={`card-at-risk-${p.id}`}>
                    <div className="w-8 h-8 rounded-md bg-chart-5/15 flex items-center justify-center text-chart-5 text-xs font-medium">
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
