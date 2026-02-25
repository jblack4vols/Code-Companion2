import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, MessageSquare, FileText, ClipboardList, ChevronRight, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { getQueryFn } from "@/lib/queryClient";
import { useLocation } from "wouter";

const TYPE_FILTERS = [
  { value: "all", label: "All Activity" },
  { value: "referral", label: "Referrals" },
  { value: "interaction", label: "Interactions" },
  { value: "task", label: "Tasks" },
];

export default function RecentActivityPage() {
  const [, navigate] = useLocation();
  const [typeFilter, setTypeFilter] = useState("all");
  const { data: activities, isLoading, isError, refetch, dataUpdatedAt } = useQuery<any[]>({
    queryKey: ["/api/activity-feed?limit=50"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const filtered = activities?.filter(a =>
    typeFilter === "all" ? true : a.activity_type === typeFilter
  ) || [];

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

  const getActivityDetails = (activity: any) => {
    let icon: any;
    let colorClass: string;
    let description: string;
    let badge: string;

    switch (activity.activity_type) {
      case "interaction":
        icon = MessageSquare;
        colorClass = "bg-chart-2/15 text-chart-2";
        description = `${activity.user_name} logged a ${activity.type?.toLowerCase() || 'contact'} with Dr. ${activity.physician_last_name}`;
        badge = activity.type || "Contact";
        break;
      case "task":
        icon = ClipboardList;
        colorClass = "bg-chart-4/15 text-chart-4";
        description = `${activity.user_name} completed: ${activity.summary}`;
        badge = "Task";
        break;
      case "referral":
        icon = FileText;
        colorClass = "bg-chart-1/15 text-chart-1";
        description = `New referral from ${activity.physician_name} at ${activity.location_name}`;
        badge = "Referral";
        break;
      default:
        icon = Activity;
        colorClass = "bg-muted/50 text-muted-foreground";
        description = "Unknown activity";
        badge = "Other";
    }

    return { icon, colorClass, description, badge };
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">Recent Activity</h1>
          <p className="text-sm text-muted-foreground">
            All team actions across referrals, interactions, and tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline" data-testid="text-last-updated">
              Updated {format(new Date(dataUpdatedAt), "h:mm a")}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-activity">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map(f => (
              <SelectItem key={f.value} value={f.value} data-testid={`option-filter-${f.value}`}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {typeFilter !== "all" && (
          <Badge variant="secondary" className="text-xs" data-testid="badge-filter-count">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-md shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center">
              <p className="text-sm text-muted-foreground mb-3" data-testid="text-activity-error">Failed to load activity feed</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-activity">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <Activity className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {typeFilter === "all" ? "No recent activity" : `No ${typeFilter} activity found`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(activity => {
            const { icon: IconComponent, colorClass, description, badge } = getActivityDetails(activity);
            const timestamp = format(new Date(activity.timestamp), "MMM d, yyyy 'at' h:mm a");
            const link = getActivityLink(activity);

            return (
              <Card
                key={activity.id}
                className={link ? "cursor-pointer hover-elevate" : ""}
                onClick={() => link && navigate(link)}
                data-testid={`activity-item-${activity.id}`}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 ${colorClass}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground" data-testid={`text-activity-desc-${activity.id}`}>{description}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex" data-testid={`badge-type-${activity.id}`}>
                          {badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{timestamp}</p>
                      {activity.summary && activity.activity_type === "referral" && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{activity.summary}</p>
                      )}
                    </div>
                    {link && <ChevronRight className="w-4 h-4 text-muted-foreground mt-2 shrink-0" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
