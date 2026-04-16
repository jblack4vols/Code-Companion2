import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, List, Trash2, ExternalLink, ChevronsUpDown, Check, Building2, User, X, CheckCircle2, Circle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CalendarEvent, Physician, Location } from "@shared/schema";
import { CalendarOutlookConnect } from "./calendar-outlook-connect";
import { CalendarUserFilter, buildUserColorMap, getUserColor } from "./calendar-user-filter";
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
  const [practiceFilter, setPracticeFilter] = useState<string>("all");
  const [practiceFilterOpen, setPracticeFilterOpen] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // selectedUserIds: empty Set = "all users" (default), non-empty = filtered subset
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [selectedPracticeName, setSelectedPracticeName] = useState<string>("");
  const [practiceComboOpen, setPracticeComboOpen] = useState(false);
  const [practiceSearchInput, setPracticeSearchInput] = useState("");
  const [showNewOfficeForm, setShowNewOfficeForm] = useState(false);
  const [newOfficeName, setNewOfficeName] = useState("");
  const practiceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!practiceComboOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (practiceDropdownRef.current && !practiceDropdownRef.current.contains(e.target as Node)) {
        setPracticeComboOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [practiceComboOpen]);

  const addOfficeMutation = useMutation({
    mutationFn: async (data: { practiceName: string; address?: string; city?: string; state?: string; phone?: string }) => {
      const res = await apiRequest("POST", "/api/physicians", {
        firstName: data.practiceName,
        lastName: "(Office)",
        practiceName: data.practiceName,
        primaryOfficeAddress: data.address || null,
        city: data.city || null,
        state: data.state || null,
        phone: data.phone || null,
        status: "PROSPECT",
        relationshipStage: "NEW",
        priority: "MEDIUM",
      });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/practice-names"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider-offices"] });
      setSelectedPracticeName(vars.practiceName);
      setShowNewOfficeForm(false);
      setNewOfficeName("");
      toast({ title: "Office created", description: `"${vars.practiceName}" added and selected.` });
    },
    onError: (err: Error) => toast({ title: "Error creating office", description: err.message, variant: "destructive" }),
  });

  const [practiceDetailName, setPracticeDetailName] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = format(monthStart, "yyyy-MM-dd");
  const endDate = format(monthEnd, "yyyy-MM-dd");

  const userIdsParam = selectedUserIds.size > 0 ? Array.from(selectedUserIds).join(",") : undefined;

  const queryParams = new URLSearchParams({ startDate, endDate });
  if (locationFilter !== "all") queryParams.set("locationId", locationFilter);
  if (practiceFilter !== "all") queryParams.set("practiceName", practiceFilter);
  if (userIdsParam) queryParams.set("userIds", userIdsParam);

  const { data: events, isLoading, isError, refetch } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events", startDate, endDate, locationFilter, practiceFilter, userIdsParam ?? "all"],
    queryFn: async () => {
      const res = await fetch(`/api/calendar-events?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: practiceNames } = useQuery<string[]>({ queryKey: ["/api/physicians/practice-names"] });
  const { data: allUsers } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Stable map of userId → color index for consistent event coloring
  const userColorMap = useMemo(() => buildUserColorMap(allUsers ?? []), [allUsers]);

  const { data: practicePhysicians } = useQuery<Physician[]>({
    queryKey: ["/api/physicians/by-practice", selectedPracticeName],
    queryFn: async () => {
      if (!selectedPracticeName) return [];
      const res = await fetch(`/api/physicians/by-practice?name=${encodeURIComponent(selectedPracticeName)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPracticeName,
  });

  const { data: detailPhysicians } = useQuery<Physician[]>({
    queryKey: ["/api/physicians/by-practice", practiceDetailName],
    queryFn: async () => {
      if (!practiceDetailName) return [];
      const res = await fetch(`/api/physicians/by-practice?name=${encodeURIComponent(practiceDetailName)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!practiceDetailName,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/calendar-events", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/practice-names"] });
      setDialogOpen(false);
      setEditingEvent(null);
      setSelectedPracticeName("");
      toast({ title: "Event created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/calendar-events/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/practice-names"] });
      setDialogOpen(false);
      setEditingEvent(null);
      setSelectedPracticeName("");
      toast({ title: "Event updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/calendar-events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setDialogOpen(false);
      setEditingEvent(null);
      setSelectedPracticeName("");
      toast({ title: "Event deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
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
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await apiRequest("PATCH", `/api/calendar-events/${id}`, { completed });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: data.completed ? "Event marked complete" : "Event marked incomplete" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      title: fd.get("title"),
      description: fd.get("description") || null,
      eventType: fd.get("eventType"),
      startAt: new Date(fd.get("startAt") as string).toISOString(),
      endAt: new Date(fd.get("endAt") as string).toISOString(),
      locationId: fd.get("locationId") || null,
      practiceName: selectedPracticeName || null,
      physicianId: null,
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
    setSelectedPracticeName("");
    setSelectedDate(date || new Date());
    setDialogOpen(true);
  };

  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    setSelectedPracticeName(event.practiceName || "");
    setSelectedDate(null);
    setDialogOpen(true);
  };

  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const typeFilteredEvents = eventTypeFilter === "all"
    ? events
    : events?.filter(e => e.eventType === eventTypeFilter);

  const getEventsForDay = (day: Date) =>
    typeFilteredEvents?.filter((e) => isSameDay(new Date(e.startAt), day)) || [];

  const sortedEvents = typeFilteredEvents
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
          <p className="text-xs sm:text-sm text-muted-foreground">Manage events and office visits</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarOutlookConnect />
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
        <Popover open={practiceFilterOpen} onOpenChange={setPracticeFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[200px] justify-between font-normal" data-testid="select-filter-practice">
              {practiceFilter !== "all" ? (
                <span className="truncate">{practiceFilter}</span>
              ) : (
                <span>All Offices</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(300px,calc(100vw-2rem))] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search offices..." data-testid="input-filter-practice-search" />
              <CommandList>
                <CommandEmpty>No office found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => { setPracticeFilter("all"); setPracticeFilterOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${practiceFilter === "all" ? "opacity-100" : "opacity-0"}`} />
                    All Offices
                  </CommandItem>
                  {practiceNames?.map((name) => (
                    <CommandItem
                      key={name}
                      value={name}
                      onSelect={() => { setPracticeFilter(name); setPracticeFilterOpen(false); }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${practiceFilter === name ? "opacity-100" : "opacity-0"}`} />
                      {name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-event-type">
            <SelectValue placeholder="Event Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MEETING">Meeting</SelectItem>
            <SelectItem value="LUNCH">Lunch</SelectItem>
            <SelectItem value="OFFICE_VISIT">Office Visit</SelectItem>
            <SelectItem value="CALL">Call</SelectItem>
            <SelectItem value="CONFERENCE">Conference</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <CalendarUserFilter selectedUserIds={selectedUserIds} onChange={setSelectedUserIds} />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarIcon className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground mb-3" data-testid="text-calendar-error">Failed to load calendar events</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-calendar">
              Retry
            </Button>
          </CardContent>
        </Card>
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
                      {dayEvents.slice(0, 3).map((evt) => {
                        return (
                        <div
                          key={evt.id}
                          className={`text-[10px] px-1 py-0.5 rounded truncate cursor-pointer flex items-center gap-1 ${evt.completed ? "bg-green-600" : EVENT_TYPE_BAR_COLORS[evt.eventType]} text-white`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(evt);
                          }}
                          data-testid={`event-bar-${evt.id}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 bg-white/70`} />
                          <span className="truncate">{evt.title}</span>
                        </div>
                        );
                      })}
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
              const loc = locations?.find((l) => l.id === evt.locationId);
              const evtPractice = evt.practiceName;
              const colorIdx = userColorMap.get(evt.organizerUserId);
              const organizerColor = colorIdx !== undefined ? getUserColor(colorIdx) : null;
              const organizerUser = allUsers?.find((u) => u.id === evt.organizerUserId);
              return (
                <Card
                  key={evt.id}
                  className={`cursor-pointer hover-elevate ${evt.completed ? "border-green-500/40" : ""}`}
                  onClick={() => openEditDialog(evt)}
                  data-testid={`card-event-${evt.id}`}
                >
                  <CardContent className="p-4 flex gap-3">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${evt.completed ? "bg-green-600/15 text-green-600" : EVENT_TYPE_COLORS[evt.eventType]}`}>
                      {evt.completed ? <CheckCircle2 className="w-4 h-4" /> : <CalendarIcon className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium truncate ${evt.completed ? "line-through text-muted-foreground" : ""}`}>{evt.title}</span>
                        {evt.completed && (
                          <Badge variant="outline" className="text-[10px] bg-green-600/15 text-green-600 border-green-500/30">
                            Completed
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${EVENT_TYPE_COLORS[evt.eventType]}`}>
                          {EVENT_TYPE_LABELS[evt.eventType]}
                        </Badge>
                        {organizerUser && organizerColor && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${organizerColor.outline}`}
                            data-testid={`organizer-chip-${evt.id}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${organizerColor.dot}`} />
                            {organizerUser.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(evt.startAt), "MMM d, yyyy h:mm a")} - {format(new Date(evt.endAt), "h:mm a")}
                      </p>
                      {evtPractice && (
                        <button
                          type="button"
                          className="text-xs text-primary mt-0.5 flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPracticeDetailName(evtPractice);
                          }}
                          data-testid={`button-view-practice-${evt.id}`}
                        >
                          <Building2 className="w-3 h-3" />
                          {evtPractice}
                        </button>
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingEvent(null); setSelectedPracticeName(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "New Event"}</DialogTitle>
            <DialogDescription>
              {editingEvent ? "Update event details below" : "Create a new calendar event"}
            </DialogDescription>
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
              <Label>Office/Practice Name</Label>
              {showNewOfficeForm ? (
                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-primary" />
                      New Office
                    </p>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => { setShowNewOfficeForm(false); setNewOfficeName(""); }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <Input
                    placeholder="Office name *"
                    value={newOfficeName}
                    onChange={(e) => setNewOfficeName(e.target.value)}
                    data-testid="input-new-office-name"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Address" id="newOfficeAddress" className="text-xs" data-testid="input-new-office-address" />
                    <Input placeholder="City" id="newOfficeCity" className="text-xs" data-testid="input-new-office-city" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="State" id="newOfficeState" maxLength={2} className="text-xs" data-testid="input-new-office-state" />
                    <Input placeholder="Phone" id="newOfficePhone" className="text-xs" data-testid="input-new-office-phone" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowNewOfficeForm(false); setNewOfficeName(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newOfficeName.trim() || addOfficeMutation.isPending}
                      onClick={() => {
                        addOfficeMutation.mutate({
                          practiceName: newOfficeName.trim(),
                          address: (document.getElementById("newOfficeAddress") as HTMLInputElement)?.value.trim() || undefined,
                          city: (document.getElementById("newOfficeCity") as HTMLInputElement)?.value.trim() || undefined,
                          state: (document.getElementById("newOfficeState") as HTMLInputElement)?.value.trim() || undefined,
                          phone: (document.getElementById("newOfficePhone") as HTMLInputElement)?.value.trim() || undefined,
                        });
                      }}
                      data-testid="button-save-new-office"
                    >
                      {addOfficeMutation.isPending ? "Creating..." : "Create & Select"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative" ref={practiceDropdownRef}>
                  <Input
                    placeholder="Search for an office..."
                    value={practiceComboOpen ? practiceSearchInput : selectedPracticeName}
                    onChange={(e) => {
                      setPracticeSearchInput(e.target.value);
                      if (!practiceComboOpen) setPracticeComboOpen(true);
                    }}
                    onFocus={() => {
                      setPracticeComboOpen(true);
                      setPracticeSearchInput(selectedPracticeName);
                    }}
                    data-testid="input-search-practice"
                  />
                  {selectedPracticeName && !practiceComboOpen && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => { setSelectedPracticeName(""); setPracticeSearchInput(""); }}
                      data-testid="button-clear-practice"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {practiceComboOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
                      {(() => {
                        const trimmed = practiceSearchInput.trim();
                        const filtered = (practiceNames || []).filter((n) =>
                          n.toLowerCase().includes(practiceSearchInput.toLowerCase())
                        );
                        const exactMatch = filtered.some((n) => n.toLowerCase() === trimmed.toLowerCase());
                        return (
                          <>
                            {trimmed && !exactMatch && (
                              <button
                                key="__add_new__"
                                type="button"
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground border-b text-primary font-medium"
                                onClick={() => {
                                  setNewOfficeName(trimmed);
                                  setShowNewOfficeForm(true);
                                  setPracticeComboOpen(false);
                                  setPracticeSearchInput("");
                                }}
                                data-testid="button-add-new-practice"
                              >
                                <Plus className="w-4 h-4 shrink-0" />
                                Add "{trimmed}" as new office
                              </button>
                            )}
                            {filtered.length === 0 && !trimmed && (
                              <div className="px-3 py-2 text-sm text-muted-foreground">No offices available.</div>
                            )}
                            {filtered.map((name) => (
                              <button
                                key={name}
                                type="button"
                                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground ${selectedPracticeName === name ? "bg-accent/50" : ""}`}
                                onClick={() => {
                                  setSelectedPracticeName(name);
                                  setPracticeComboOpen(false);
                                  setPracticeSearchInput("");
                                }}
                                data-testid={`option-practice-${name.replace(/\s+/g, "-").substring(0, 30)}`}
                              >
                                <Check className={`w-4 h-4 shrink-0 ${selectedPracticeName === name ? "opacity-100" : "opacity-0"}`} />
                                {name}
                              </button>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedPracticeName && practicePhysicians && practicePhysicians.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Referring Providers at {selectedPracticeName}</Label>
                <div className="border rounded-md p-2 space-y-1 max-h-[120px] overflow-y-auto bg-muted/30">
                  {practicePhysicians.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs" data-testid={`text-practice-physician-${p.id}`}>
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span>Dr. {p.firstName} {p.lastName}</span>
                      {p.specialty && <span className="text-muted-foreground">- {p.specialty}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      variant={editingEvent.completed ? "outline" : "default"}
                      size="sm"
                      className={editingEvent.completed ? "" : "bg-green-600 text-white"}
                      onClick={() => toggleCompleteMutation.mutate({ id: editingEvent.id, completed: !editingEvent.completed })}
                      disabled={toggleCompleteMutation.isPending}
                      data-testid="button-toggle-complete"
                    >
                      {editingEvent.completed ? <Circle className="w-4 h-4 mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                      {toggleCompleteMutation.isPending ? "Updating..." : editingEvent.completed ? "Mark Incomplete" : "Mark Complete"}
                    </Button>
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

      <Dialog open={!!practiceDetailName} onOpenChange={(open) => { if (!open) setPracticeDetailName(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {practiceDetailName}
            </DialogTitle>
            <DialogDescription>View referring providers at this office</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Referring Providers at this office:</p>
            {!detailPhysicians ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : detailPhysicians.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No referring providers found for this practice.</p>
            ) : (
              <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto">
                {detailPhysicians.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3" data-testid={`detail-physician-${p.id}`}>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Dr. {p.firstName} {p.lastName}</p>
                      {p.specialty && <p className="text-xs text-muted-foreground">{p.specialty}</p>}
                      {p.city && <p className="text-xs text-muted-foreground">{p.city}{p.state ? `, ${p.state}` : ""}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
