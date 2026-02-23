import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, MessageSquare, Phone, Mail, Calendar as CalIcon, Coffee, Users, MoreHorizontal, X, Download, FileStack } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Interaction, Physician, User, Location, InteractionTemplate } from "@shared/schema";
import { format, isAfter, isBefore, startOfDay, endOfDay, parseISO } from "date-fns";

const typeIcons: Record<string, { icon: any; color: string }> = {
  VISIT: { icon: Users, color: "bg-chart-1/15 text-chart-1" },
  CALL: { icon: Phone, color: "bg-chart-2/15 text-chart-2" },
  EMAIL: { icon: Mail, color: "bg-chart-3/15 text-chart-3" },
  EVENT: { icon: CalIcon, color: "bg-chart-4/15 text-chart-4" },
  LUNCH: { icon: Coffee, color: "bg-chart-5/15 text-chart-5" },
  OTHER: { icon: MoreHorizontal, color: "bg-muted text-muted-foreground" },
};

export default function InteractionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const { data: interactions, isLoading } = useQuery<Interaction[]>({ queryKey: ["/api/interactions"] });
  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: templates } = useQuery<InteractionTemplate[]>({ queryKey: ["/api/templates"] });

  const applyTemplate = (templateId: string) => {
    const tpl = templates?.find(t => t.id === templateId);
    if (!tpl || !formRef.current) return;
    const form = formRef.current;
    const typeEl = form.elements.namedItem("type") as HTMLSelectElement;
    const summaryEl = form.elements.namedItem("summary") as HTMLTextAreaElement;
    const nextStepEl = form.elements.namedItem("nextStep") as HTMLInputElement;
    if (typeEl && tpl.type) typeEl.value = tpl.type;
    if (summaryEl && tpl.defaultSummary) summaryEl.value = tpl.defaultSummary;
    if (nextStepEl && tpl.defaultNextStep) nextStepEl.value = tpl.defaultNextStep;
  };

  const canCreate = user ? hasPermission(user.role, "create", "interaction") : false;
  const canExport = user ? ["OWNER", "DIRECTOR", "ANALYST"].includes(user.role) : false;

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (locationFilter !== "all") params.set("locationId", locationFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/export/interactions?${params.toString()}`, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/interactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setShowAdd(false);
      toast({ title: "Interaction logged" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addMutation.mutate({
      physicianId: fd.get("physicianId"),
      userId: user?.id,
      type: fd.get("type"),
      occurredAt: new Date(fd.get("occurredAt") as string).toISOString(),
      summary: fd.get("summary"),
      nextStep: fd.get("nextStep") || null,
      locationId: fd.get("locationId") || null,
    });
  };

  const hasActiveFilters = typeFilter !== "all" || locationFilter !== "all" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setTypeFilter("all");
    setLocationFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  const filtered = interactions?.filter(i => {
    const phys = physicians?.find(p => p.id === i.physicianId);
    const matchSearch = search === "" ||
      (phys && `${phys.firstName} ${phys.lastName}`.toLowerCase().includes(search.toLowerCase())) ||
      i.summary.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || i.type === typeFilter;
    const matchLocation = locationFilter === "all" || i.locationId === locationFilter;
    const occurredDate = i.occurredAt ? startOfDay(new Date(i.occurredAt)) : null;
    const matchDateFrom = !dateFrom || (occurredDate && !isBefore(occurredDate, startOfDay(parseISO(dateFrom))));
    const matchDateTo = !dateTo || (occurredDate && !isAfter(occurredDate, endOfDay(parseISO(dateTo))));
    return matchSearch && matchType && matchLocation && matchDateFrom && matchDateTo;
  })?.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()) || [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-interactions-title">Interactions</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Track outreach and touchpoints</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-interactions">
              <Download className="w-3 h-3 mr-1.5" />Export CSV
            </Button>
          )}
        {canCreate && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-interaction"><Plus className="w-4 h-4 mr-2" />Log Interaction</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log New Interaction</DialogTitle></DialogHeader>
              <form ref={formRef} onSubmit={handleAdd} className="space-y-4">
                {templates && templates.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><FileStack className="w-3.5 h-3.5" />Use Template</Label>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      data-testid="select-interaction-template"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }}
                    >
                      <option value="">No template — start blank</option>
                      {templates.filter(t => t.isActive).map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Referring Provider *</Label>
                  <select name="physicianId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-new-interaction-physician">
                    <option value="">Select referring provider...</option>
                    {physicians?.map(p => <option key={p.id} value={p.id}>Dr. {p.firstName} {p.lastName}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type *</Label>
                    <select name="type" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-new-interaction-type">
                      <option value="VISIT">Visit</option>
                      <option value="CALL">Call</option>
                      <option value="EMAIL">Email</option>
                      <option value="EVENT">Event</option>
                      <option value="LUNCH">Lunch</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date *</Label>
                    <Input name="occurredAt" type="datetime-local" defaultValue={format(new Date(), "yyyy-MM-dd'T'HH:mm")} required data-testid="input-new-interaction-date" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <select name="locationId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-new-interaction-location">
                    <option value="">None</option>
                    {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Summary *</Label>
                  <Textarea name="summary" required placeholder="What happened?" data-testid="input-new-interaction-summary" />
                </div>
                <div className="space-y-1.5">
                  <Label>Next Step</Label>
                  <Input name="nextStep" placeholder="Optional follow-up" data-testid="input-new-interaction-nextstep" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-new-interaction">
                    {addMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-3">
        <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[200px] lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search interactions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-interactions" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger data-testid="select-filter-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="VISIT">Visit</SelectItem>
            <SelectItem value="CALL">Call</SelectItem>
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="EVENT">Event</SelectItem>
            <SelectItem value="LUNCH">Lunch</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger data-testid="select-filter-interaction-location">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 sm:col-span-2 lg:col-span-1">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            data-testid="input-filter-interaction-date-from"
          />
          <span className="text-xs text-muted-foreground shrink-0">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            data-testid="input-filter-interaction-date-to"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-interaction-filters">
            <X className="w-3 h-3 mr-1" />Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">No interactions found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(i => {
            const phys = physicians?.find(p => p.id === i.physicianId);
            const usr = users?.find(u => u.id === i.userId);
            const loc = locations?.find(l => l.id === i.locationId);
            const typeInfo = typeIcons[i.type] || typeIcons.OTHER;
            const Icon = typeInfo.icon;
            return (
              <Card key={i.id} data-testid={`card-interaction-${i.id}`}>
                <CardContent className="p-4 flex gap-3">
                  <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${typeInfo.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{i.type}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(i.occurredAt), "MMM d, yyyy h:mm a")}</span>
                      {loc && <span className="text-xs text-muted-foreground">at {loc.name}</span>}
                    </div>
                    <p className="text-sm font-medium mt-1">
                      {phys ? `Dr. ${phys.firstName} ${phys.lastName}` : "Unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">{i.summary}</p>
                    {i.nextStep && <p className="text-xs text-muted-foreground mt-1">Next step: {i.nextStep}</p>}
                    {usr && <p className="text-xs text-muted-foreground mt-1">by {usr.name}</p>}
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
