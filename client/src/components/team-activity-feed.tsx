import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getQueryFn } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  type ActivityItem,
  getActivityMeta,
  getActivityDescription,
  getInitials,
} from "@/components/activity-feed-helpers";

type FilterTab = "all" | "interaction" | "referral" | "task";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "interaction", label: "Interactions" },
  { key: "referral", label: "Referrals" },
  { key: "task", label: "Tasks" },
];

function safeRelativeTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return "";
  }
}

export function TeamActivityFeed() {
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const { data: rawActivities, isLoading, isError, refetch } = useQuery<ActivityItem[]>({
    queryKey: ["/api/activity-feed?limit=20"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const activities = rawActivities?.slice(0, 20) ?? [];
  const filtered = activeFilter === "all"
    ? activities
    : activities.filter(a => a.activity_type === activeFilter);

  return (
    <Card data-testid="card-team-activity-feed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold" data-testid="text-activity-feed-title">Team Activity</h3>
            <p className="text-xs text-muted-foreground">Latest actions across your team</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => navigate("/activity")}
            data-testid="button-view-all-team-activity"
          >
            View all
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mt-2" role="tablist" data-testid="group-activity-filter-tabs">
          {FILTER_TABS.map(({ key, label }) => (
            <Button
              key={key}
              role="tab"
              variant={activeFilter === key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setActiveFilter(key)}
              aria-selected={activeFilter === key}
              data-testid={`tab-activity-filter-${key}`}
            >
              {label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-0 px-4 pb-4">
        {isLoading && (
          <div className="space-y-3" data-testid="skeleton-activity-feed">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <p className="text-sm text-muted-foreground" data-testid="text-team-activity-error">
              Failed to load activity feed
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-team-activity">
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground" data-testid="text-no-team-activity">
            No activity to display
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <ol className="relative border-l border-border/50 ml-3 space-y-0" data-testid="list-team-activity">
            {filtered.map((activity, idx) => {
              const { Icon, color, border } = getActivityMeta(activity.activity_type);
              const isLast = idx === filtered.length - 1;
              return (
                <li
                  key={activity.id}
                  className={`pl-5 ${isLast ? "pb-0" : "pb-4"}`}
                  data-testid={`activity-feed-item-${activity.id}`}
                >
                  {/* Timeline dot with activity type icon */}
                  <span
                    className={`absolute -left-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 bg-background ${border}`}
                    aria-hidden="true"
                  >
                    <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                  </span>

                  <div className="flex items-start gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0 text-[10px]">
                      <AvatarFallback className={color}>
                        {getInitials(activity.user_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug text-foreground" data-testid={`text-activity-description-${activity.id}`}>
                        {getActivityDescription(activity)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5" data-testid={`text-activity-time-${activity.id}`}>
                        {safeRelativeTime(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
