import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, Calendar, ClipboardList, MessageSquare,
  MapPin, Clock, Users, Phone, Mail, Coffee, MoreHorizontal,
  CheckCircle2, Circle, AlertCircle, Building2, Target,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval, isSameDay, isToday, isPast, isBefore, startOfDay } from "date-fns";
import { Link } from "wouter";

const EVENT_TYPE_COLORS: Record<string, string> = {
  MEETING: "bg-blue-500",
  CALL: "bg-amber-500",
  VISIT: "bg-green-500",
  LUNCH: "bg-purple-500",
  OTHER: "bg-gray-500",
};

const typeIcons: Record<string, any> = {
  VISIT: Users,
  CALL: Phone,
  EMAIL: Mail,
  LUNCH: Coffee,
  EVENT: Calendar,
  OTHER: MoreHorizontal,
};

const priorityColors: Record<string, string> = {
  HIGH: "bg-red-500/15 text-red-600 border-red-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  LOW: "bg-green-500/15 text-green-600 border-green-500/30",
};

interface HitListEvent {
  id: string;
  title: string;
  eventType: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  completed: boolean;
  locationId: string | null;
  practiceName: string | null;
  physicianId: string | null;
  description: string | null;
  locationName: string | null;
}

interface HitListTask {
  id: string;
  description: string;
  status: string;
  priority: string;
  dueAt: string;
  physicianId: string | null;
  physicianFirstName: string | null;
  physicianLastName: string | null;
}

interface HitListFollowUp {
  id: string;
  type: string;
  summary: string;
  followUpDueAt: string;
  physicianId: string | null;
  physicianFirstName: string | null;
  physicianLastName: string | null;
  locationName: string | null;
}

interface HitListData {
  events: HitListEvent[];
  tasks: HitListTask[];
  followUps: HitListFollowUp[];
}

export default function HitListPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }), [weekOffset]);
  const weekEnd = useMemo(() => endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }), [weekOffset]);
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const { data, isLoading } = useQuery<HitListData>({
    queryKey: ["/api/dashboard/hit-list", weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
      });
      const res = await fetch(`/api/dashboard/hit-list?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const getDayItems = (day: Date) => {
    if (!data) return { events: [], tasks: [], followUps: [] };
    return {
      events: data.events.filter(e => isSameDay(new Date(e.startAt), day)),
      tasks: data.tasks.filter(t => isSameDay(new Date(t.dueAt), day)),
      followUps: data.followUps.filter(f => f.followUpDueAt && isSameDay(new Date(f.followUpDueAt), day)),
    };
  };

  const totalEvents = data?.events.length || 0;
  const totalTasks = data?.tasks.length || 0;
  const totalFollowUps = data?.followUps.length || 0;
  const completedEvents = data?.events.filter(e => e.completed).length || 0;
  const completedTasks = data?.tasks.filter(t => t.status === "DONE").length || 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2" data-testid="text-hitlist-title">
            <Target className="w-6 h-6 text-primary" />
            Daily Hit List
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Your agenda for the week — events, tasks, and follow-ups</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)} data-testid="button-prev-week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)} data-testid="button-this-week">
            This Week
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)} data-testid="button-next-week">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground font-medium" data-testid="text-week-range">
        {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d, yyyy")}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-blue-500/15 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-lg font-bold" data-testid="text-total-events">{totalEvents}</p>
              <p className="text-[10px] text-muted-foreground">Events ({completedEvents} done)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-500/15 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-lg font-bold" data-testid="text-total-tasks">{totalTasks}</p>
              <p className="text-[10px] text-muted-foreground">Tasks ({completedTasks} done)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-purple-500/15 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <p className="text-lg font-bold" data-testid="text-total-followups">{totalFollowUps}</p>
              <p className="text-[10px] text-muted-foreground">Follow-ups</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-lg font-bold" data-testid="text-completion-rate">
                {totalEvents + totalTasks > 0 ? Math.round(((completedEvents + completedTasks) / (totalEvents + totalTasks)) * 100) : 0}%
              </p>
              <p className="text-[10px] text-muted-foreground">Completion</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {days.map(day => {
            const { events, tasks: dayTasks, followUps } = getDayItems(day);
            const dayTotal = events.length + dayTasks.length + followUps.length;
            const today = isToday(day);
            const pastDay = isBefore(startOfDay(day), startOfDay(new Date())) && !today;

            return (
              <Card
                key={day.toISOString()}
                className={`${today ? "border-primary ring-1 ring-primary/20" : ""} ${pastDay ? "opacity-70" : ""}`}
                data-testid={`card-day-${format(day, "yyyy-MM-dd")}`}
              >
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <span className={`${today ? "text-primary" : ""}`}>
                        {format(day, "EEEE, MMM d")}
                      </span>
                      {today && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                          Today
                        </Badge>
                      )}
                    </CardTitle>
                    {dayTotal > 0 && (
                      <Badge variant="secondary" className="text-[10px]" data-testid={`badge-count-${format(day, "yyyy-MM-dd")}`}>
                        {dayTotal} item{dayTotal !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {dayTotal === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No items scheduled</p>
                  ) : (
                    <div className="space-y-1.5">
                      {events.map(evt => (
                        <div
                          key={`evt-${evt.id}`}
                          className={`flex items-center gap-2.5 p-2 rounded-md border ${evt.completed ? "bg-green-500/5 border-green-500/20" : "bg-card"}`}
                          data-testid={`hitlist-event-${evt.id}`}
                        >
                          <div className={`w-1 h-8 rounded-full shrink-0 ${evt.completed ? "bg-green-500" : EVENT_TYPE_COLORS[evt.eventType] || "bg-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {evt.completed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              ) : (
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className={`text-sm font-medium truncate ${evt.completed ? "line-through text-muted-foreground" : ""}`}>
                                {evt.title}
                              </span>
                              <Badge variant="outline" className="text-[9px] shrink-0">{evt.eventType}</Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {evt.allDay ? "All day" : `${format(new Date(evt.startAt), "h:mm a")} - ${format(new Date(evt.endAt), "h:mm a")}`}
                              </span>
                              {(evt.locationName || evt.practiceName) && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  {evt.practiceName || evt.locationName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {dayTasks.map(task => {
                        const isDone = task.status === "DONE";
                        const isOverdue = !isDone && isPast(new Date(task.dueAt));
                        return (
                          <div
                            key={`task-${task.id}`}
                            className={`flex items-center gap-2.5 p-2 rounded-md border ${isDone ? "bg-green-500/5 border-green-500/20" : isOverdue ? "bg-red-500/5 border-red-500/20" : "bg-card"}`}
                            data-testid={`hitlist-task-${task.id}`}
                          >
                            <div className={`w-1 h-8 rounded-full shrink-0 ${isDone ? "bg-green-500" : isOverdue ? "bg-red-500" : "bg-amber-500"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isDone ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                ) : isOverdue ? (
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                )}
                                <span className={`text-sm truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>
                                  {task.description}
                                </span>
                                <Badge variant="outline" className={`text-[9px] shrink-0 ${priorityColors[task.priority] || ""}`}>
                                  {task.priority}
                                </Badge>
                              </div>
                              {task.physicianFirstName && (
                                <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                                  <Users className="w-3 h-3" />
                                  Dr. {task.physicianFirstName} {task.physicianLastName}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {followUps.map(fu => {
                        const FuIcon = typeIcons[fu.type] || MoreHorizontal;
                        return (
                          <div
                            key={`fu-${fu.id}`}
                            className="flex items-center gap-2.5 p-2 rounded-md border bg-card"
                            data-testid={`hitlist-followup-${fu.id}`}
                          >
                            <div className="w-1 h-8 rounded-full shrink-0 bg-purple-500" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <FuIcon className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                <span className="text-sm truncate">Follow up: {fu.summary}</span>
                                <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-600 border-purple-500/20 shrink-0">
                                  {fu.type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                                {fu.physicianFirstName && (
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    Dr. {fu.physicianFirstName} {fu.physicianLastName}
                                  </span>
                                )}
                                {fu.locationName && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {fu.locationName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
