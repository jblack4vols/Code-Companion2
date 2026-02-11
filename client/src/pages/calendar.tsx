import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, List, Trash2, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CalendarEvent, Physician, Location } from "@shared/schema";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
} from "date-fns";

const EVENT_TYPE_COLORS: Record<string, string> = {
  MEETING: "bg-chart-1/15 text-chart-1",
  LUNCH: "bg-chart-2/15 text-chart-2",
  OFFICE_VISIT: "bg-chart-3/15 text-chart-3",
  CALL: "bg-chart-4/15 text-chart-4",
  CONFERENCE: "bg-chart-5/15 text-chart-5",
  OTHER: "bg-muted text-muted-foreground",
};

const EVENT_TYPE_BAR_COLORS: Record<string, string> = {
  MEETING: "bg-chart-1",
  LUNCH: "bg-chart-2",
  OFFICE_VISIT: "bg-chart-3",
  CALL: "bg-chart-4",
  CONFERENCE: "bg-chart-5",
  OTHER: "bg-muted-foreground",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  MEETING: "Meeting",
  LUNCH: "Lunch",
  OFFICE_VISIT: "Office Visit",
  CALL: "Call",
  CONFERENCE: "Conference",
  OTHER: "Other",
};

type ViewMode = "calendar" | "list";

export default function CalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [physicianFilter, setPhysicianFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = format(monthStart, "yyyy-MM-dd");
  const endDate = format(monthEnd, "yyyy-MM-dd");

  const queryParams = new URLSearchParams({ startDate, endDate });
  if (locationFilter !== "all") queryParams.set("locationId", locationFilter);
  if (physicianFilter !== "all") queryParams.set("physicianId", physicianFilter);

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events", startDate, endDate, locationFilter, physicianFilter],
    queryFn: async () => {
      const res = await fetch(`/api/calendar-events?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/calendar-events", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setDialogOpen(false);
      setEditingEvent(null);
      toast({ title: "Event created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/calendar-events/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setDialogOpen(false);
      setEditingEvent(null);
      toast({ title: "Event updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/calendar-events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setDialogOpen(false);
      setEditingEvent(null);
      toast({ title: "Event deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const syncOutlookMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest("POST", "/api/integrations/outlook/sync-event", { eventId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Synced to Outlook" });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: any = {
      title: fd.get("title"),
      description: fd.get("description") || null,
      eventType: fd.get("eventType"),
      startAt: new Date(fd.get("startAt") as string).toISOString(),
      endAt: new Date(fd.get("endAt") as string).toISOString(),
      locationId: fd.get("locationId") || null,
      physicianId: fd.get("physicianId") || null,
      organizerUserId: user?.id,
      meetingUrl: fd.get("meetingUrl") || null,
      allDay: fd.get("allDay") === "on",
    };

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openCreateDialog = (date?: Date) => {
    setEditingEvent(null);
    setSelectedDate(date || new Date());
    setDialogOpen(true);
  };

  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    setSelectedDate(null);
    setDialogOpen(true);
  };

  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day: Date) =>
    events?.filter((e) => isSameDay(new Date(e.startAt), day)) || [];

  const sortedEvents = events
    ?.slice()
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()) || [];

  const isPending = createMutation.isPending || updateMutation.isPending;

  const defaultStartAt = editingEvent
    ? format(new Date(editingEvent.startAt), "yyyy-MM-dd'T'HH:mm")
    : selectedDate
      ? format(selectedDate, "yyyy-MM-dd'T'09:00")
      : format(new Date(), "yyyy-MM-dd'T'09:00");

  const defaultEndAt = editingEvent
    ? format(new Date(editingEvent.endAt), "yyyy-MM-dd'T'HH:mm")
    : selectedDate
      ? format(selectedDate, "yyyy-MM-dd'T'10:00")
      : format(new Date(), "yyyy-MM-dd'T'10:00");

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-calendar-title">Calendar</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage events and appointments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={viewMode === "calendar" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("calendar")}
            data-testid="button-view-calendar"
          >
            <CalendarIcon className="w-4 h-4 mr-1" />
            Calendar
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            data-testid="button-view-list"
          >
            <List className="w-4 h-4 mr-1" />
            List
          </Button>
          <Button onClick={() => openCreateDialog()} data-testid="button-add-event">
            <Plus className="w-4 h-4 mr-2" />Add Event
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center" data-testid="text-current-month">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            data-testid="button-next-month"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-location">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations?.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={physicianFilter} onValueChange={setPhysicianFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-physician">
            <SelectValue placeholder="Physician" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Physicians</SelectItem>
            {physicians?.map((p) => (
              <SelectItem key={p.id} value={p.id}>Dr. {p.firstName} {p.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : viewMode === "calendar" ? (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-px">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-xs font-medium text-muted-foreground text-center py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((day) => {
                const dayEvents = getEventsForDay(day);
                const inMonth = isSameMonth(day, currentMonth);
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[100px] border rounded-md p-1 cursor-pointer hover-elevate ${
                      !inMonth ? "opacity-40" : ""
                    } ${today ? "border-primary" : "border-border"}`}
                    onClick={() => openCreateDialog(day)}
                    data-testid={`cell-day-${format(day, "yyyy-MM-dd")}`}
                  >
                    <div className={`text-xs font-medium mb-1 ${today ? "text-primary" : "text-muted-foreground"}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((evt) => (
                        <div
                          key={evt.id}
                          className={`text-[10px] px-1 py-0.5 rounded truncate cursor-pointer ${EVENT_TYPE_BAR_COLORS[evt.eventType]} text-white`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(evt);
                          }}
                          data-testid={`event-bar-${evt.id}`}
                        >
                          {evt.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedEvents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CalendarIcon className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground">No events this month</p>
              </CardContent>
            </Card>
          ) : (
            sortedEvents.map((evt) => {
              const phys = physicians?.find((p) => p.id === evt.physicianId);
              const loc = locations?.find((l) => l.id === evt.locationId);
              return (
                <Card
                  key={evt.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => openEditDialog(evt)}
                  data-testid={`card-event-${evt.id}`}
                >
                  <CardContent className="p-4 flex gap-3">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${EVENT_TYPE_COLORS[evt.eventType]}`}>
                      <CalendarIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{evt.title}</span>
                        <Badge variant="outline" className={`text-[10px] ${EVENT_TYPE_COLORS[evt.eventType]}`}>
                          {EVENT_TYPE_LABELS[evt.eventType]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(evt.startAt), "MMM d, yyyy h:mm a")} - {format(new Date(evt.endAt), "h:mm a")}
                      </p>
                      {phys && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Dr. {phys.firstName} {phys.lastName}
                        </p>
                      )}
                      {loc && (
                        <p className="text-xs text-muted-foreground mt-0.5">{loc.name}</p>
                      )}
                    </div>
                    <div className="flex items-start gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          syncOutlookMutation.mutate(evt.id);
                        }}
                        data-testid={`button-sync-outlook-${evt.id}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEvent(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                name="title"
                required
                defaultValue={editingEvent?.title || ""}
                placeholder="Event title"
                data-testid="input-event-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Event Type *</Label>
              <select
                name="eventType"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
                defaultValue={editingEvent?.eventType || "MEETING"}
                data-testid="select-event-type"
              >
                <option value="MEETING">Meeting</option>
                <option value="LUNCH">Lunch</option>
                <option value="OFFICE_VISIT">Office Visit</option>
                <option value="CALL">Call</option>
                <option value="CONFERENCE">Conference</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start *</Label>
                <Input
                  name="startAt"
                  type="datetime-local"
                  required
                  defaultValue={defaultStartAt}
                  data-testid="input-event-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label>End *</Label>
                <Input
                  name="endAt"
                  type="datetime-local"
                  required
                  defaultValue={defaultEndAt}
                  data-testid="input-event-end"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="allDay"
                id="allDay"
                defaultChecked={editingEvent?.allDay || false}
                className="rounded"
                data-testid="checkbox-event-allday"
              />
              <Label htmlFor="allDay" className="text-sm">All day event</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <select
                name="locationId"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={editingEvent?.locationId || ""}
                data-testid="select-event-location"
              >
                <option value="">None</option>
                {locations?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Physician</Label>
              <select
                name="physicianId"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={editingEvent?.physicianId || ""}
                data-testid="select-event-physician"
              >
                <option value="">None</option>
                {physicians?.map((p) => (
                  <option key={p.id} value={p.id}>Dr. {p.firstName} {p.lastName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                name="description"
                defaultValue={editingEvent?.description || ""}
                placeholder="Optional description"
                data-testid="input-event-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Meeting URL</Label>
              <Input
                name="meetingUrl"
                defaultValue={editingEvent?.meetingUrl || ""}
                placeholder="https://..."
                data-testid="input-event-meeting-url"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {editingEvent && (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(editingEvent.id)}
                      disabled={deleteMutation.isPending}
                      data-testid="button-delete-event"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => syncOutlookMutation.mutate(editingEvent.id)}
                      disabled={syncOutlookMutation.isPending}
                      data-testid="button-sync-outlook"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      {syncOutlookMutation.isPending ? "Syncing..." : "Sync to Outlook"}
                    </Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} data-testid="button-submit-event">
                  {isPending ? "Saving..." : editingEvent ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
