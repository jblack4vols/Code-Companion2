import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getQueryFn } from "@/lib/queryClient";
import { Users, Activity, CheckCircle2, Clock } from "lucide-react";
import { format, subDays } from "date-fns";

interface UserActivity {
  id: string;
  name: string;
  role: string;
  interaction_count: number;
  visit_count: number;
  call_count: number;
  email_count: number;
  lunch_count: number;
  tasks_completed: number;
  tasks_open: number;
  tasks_on_time: number;
}

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  DIRECTOR: "Director",
  MARKETER: "Marketer",
  FRONT_DESK: "Front Desk",
  ANALYST: "Analyst",
};

const roleBadgeColor: Record<string, string> = {
  OWNER: "bg-chart-5/15 text-chart-5",
  DIRECTOR: "bg-chart-1/15 text-chart-1",
  MARKETER: "bg-chart-2/15 text-chart-2",
  FRONT_DESK: "bg-chart-3/15 text-chart-3",
  ANALYST: "bg-chart-4/15 text-chart-4",
};

export default function UserActivityReportsPage() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const queryUrl = `/api/reports/user-activity?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  const { data, isLoading } = useQuery<UserActivity[]>({
    queryKey: [queryUrl],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const users = data
    ? [...data].sort((a, b) => b.interaction_count - a.interaction_count)
    : [];

  const totalInteractions = users.reduce((sum, u) => sum + u.interaction_count, 0);
  const totalTasksCompleted = users.reduce((sum, u) => sum + u.tasks_completed, 0);
  const activeMembers = users.filter(u => u.interaction_count > 0).length;

  const chartData = users.map(u => ({
    name: u.name.split(" ")[0],
    Visits: u.visit_count,
    Calls: u.call_count,
    Emails: u.email_count,
    Lunches: u.lunch_count,
  }));

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-report-title">Team Activity Report</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1" data-testid="text-report-subtitle">
          Track team outreach and task completion metrics
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-stat-total-interactions">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
              <Activity className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Total Interactions</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-total-interactions">{totalInteractions}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-tasks-completed">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-4/15 text-chart-4">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Tasks Completed</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-tasks-completed">{totalTasksCompleted}</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-active-members">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Active Team Members</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-active-members">{activeMembers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">Interactions by Team Member</h3>
            <p className="text-xs text-muted-foreground">Breakdown by type</p>
          </div>
          <Activity className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280} data-testid="chart-interactions">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Visits" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Calls" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Emails" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Lunches" fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">
              No activity data for this period
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">Team Member Details</h3>
            <p className="text-xs text-muted-foreground">Sorted by total interactions</p>
          </div>
          <Users className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-user-activity">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs">Name</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs hidden sm:table-cell">Role</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right hidden md:table-cell">Visits</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right hidden md:table-cell">Calls</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right hidden md:table-cell">Emails</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right hidden lg:table-cell">Lunches</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right">Total</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right hidden sm:table-cell">Completed</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-xs text-right hidden sm:table-cell">Open</th>
                    <th className="pb-2 font-medium text-muted-foreground text-xs text-right">On-Time %</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const onTimePercent = u.tasks_completed > 0
                      ? Math.round((u.tasks_on_time / u.tasks_completed) * 100)
                      : 0;
                    return (
                      <tr key={u.id} className="border-b last:border-0" data-testid={`row-user-${u.id}`}>
                        <td className="py-2.5 pr-4 font-medium" data-testid={`text-name-${u.id}`}>{u.name}</td>
                        <td className="py-2.5 pr-4 hidden sm:table-cell">
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${roleBadgeColor[u.role] || ""}`} data-testid={`badge-role-${u.id}`}>
                            {roleLabels[u.role] || u.role}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right hidden md:table-cell" data-testid={`text-visits-${u.id}`}>{u.visit_count}</td>
                        <td className="py-2.5 pr-4 text-right hidden md:table-cell" data-testid={`text-calls-${u.id}`}>{u.call_count}</td>
                        <td className="py-2.5 pr-4 text-right hidden md:table-cell" data-testid={`text-emails-${u.id}`}>{u.email_count}</td>
                        <td className="py-2.5 pr-4 text-right hidden lg:table-cell" data-testid={`text-lunches-${u.id}`}>{u.lunch_count}</td>
                        <td className="py-2.5 pr-4 text-right font-medium" data-testid={`text-total-${u.id}`}>{u.interaction_count}</td>
                        <td className="py-2.5 pr-4 text-right hidden sm:table-cell" data-testid={`text-completed-${u.id}`}>{u.tasks_completed}</td>
                        <td className="py-2.5 pr-4 text-right hidden sm:table-cell" data-testid={`text-open-${u.id}`}>{u.tasks_open}</td>
                        <td className="py-2.5 text-right" data-testid={`text-ontime-${u.id}`}>
                          <span className={onTimePercent >= 80 ? "text-chart-4" : onTimePercent >= 50 ? "text-chart-2" : "text-chart-5"}>
                            {onTimePercent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
              No team activity data for this period
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
