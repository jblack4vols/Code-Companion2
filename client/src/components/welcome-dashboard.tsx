import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, UserPlus, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getQueryFn } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

// Derive greeting based on current hour
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Format first name from full name string
function getFirstName(name: string | undefined | null): string {
  if (!name) return "";
  return name.split(" ")[0];
}

export function WelcomeDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const today = new Date();

  // Tasks due today
  const todayStr = format(today, "yyyy-MM-dd");
  const { data: tasks, isLoading: loadingTasks } = useQuery<{ dueDate?: string; status?: string }[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Activity this week
  const weekStart = format(startOfWeek(today), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(today), "yyyy-MM-dd");
  const activityUrl = `/api/activity-feed?startDate=${weekStart}&endDate=${weekEnd}&limit=100`;
  const { data: weekActivity, isLoading: loadingActivity } = useQuery<{ activity_type: string; timestamp: string }[]>({
    queryKey: [activityUrl],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Referrals this month
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const referralsUrl = `/api/referrals?startDate=${monthStart}&endDate=${monthEnd}`;
  const { data: monthReferrals, isLoading: loadingReferrals } = useQuery<unknown[]>({
    queryKey: [referralsUrl],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Count tasks due today (open/pending only)
  const tasksDueToday = tasks?.filter(t =>
    t.dueDate && t.dueDate.startsWith(todayStr) && t.status !== "COMPLETED"
  ).length ?? 0;

  // Count interactions this week from activity feed
  const interactionsThisWeek = weekActivity?.filter(a => a.activity_type === "interaction").length ?? 0;

  // Count referrals this month
  const referralsThisMonth = Array.isArray(monthReferrals) ? monthReferrals.length : 0;

  const isLoading = loadingTasks || loadingActivity || loadingReferrals;

  const quickActions = [
    { label: "Log Interaction", icon: MessageSquare, path: "/quick-log", testId: "button-quick-log-interaction" },
    { label: "Add Provider", icon: UserPlus, path: "/physicians", testId: "button-quick-add-provider" },
    { label: "Create Task", icon: ClipboardList, path: "/tasks", testId: "button-quick-create-task" },
  ];

  const stats = [
    { label: "Tasks Due Today", value: tasksDueToday, loading: loadingTasks, testId: "stat-tasks-due-today" },
    { label: "Interactions This Week", value: interactionsThisWeek, loading: loadingActivity, testId: "stat-interactions-week" },
    { label: "Referrals This Month", value: referralsThisMonth, loading: loadingReferrals, testId: "stat-referrals-month" },
  ];

  return (
    <Card className="shadow-sm border-border/60" data-testid="card-welcome-dashboard">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Greeting section */}
          <div className="space-y-0.5">
            <h2 className="font-heading text-xl font-semibold tracking-tight" data-testid="text-greeting">
              {getGreeting()}, {getFirstName(user?.name)}
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-today-date">
              {format(today, "EEEE, MMMM d, yyyy")}
            </p>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2" data-testid="group-quick-actions">
            {quickActions.map(({ label, icon: Icon, path, testId }) => (
              <Button
                key={path}
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => navigate(path)}
                data-testid={testId}
              >
                <Icon className="w-3.5 h-3.5 mr-1.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Quick stats row */}
        <div className="mt-4 grid grid-cols-3 gap-3" data-testid="group-quick-stats">
          {stats.map(({ label, value, loading, testId }) => (
            <div
              key={label}
              className="rounded-lg bg-muted/40 px-3 py-2.5 text-center"
              data-testid={testId}
            >
              {loading ? (
                <Skeleton className="h-6 w-10 mx-auto mb-1" />
              ) : (
                <p className="text-xl font-bold tabular-nums">{value}</p>
              )}
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
