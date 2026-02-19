import { useState } from "react";
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
import { Plus, ClipboardList, CheckCircle2, Circle, X, Download } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Task, Physician, User } from "@shared/schema";
import { format, isPast, isAfter, isBefore, startOfDay, endOfDay, parseISO } from "date-fns";

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const [statusFilter, setStatusFilter] = useState<string>(urlParams.get("status") || "OPEN");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: tasks, isLoading } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const canCreate = user ? hasPermission(user.role, "create", "interaction") : false;
  const canExport = user ? ["OWNER", "DIRECTOR"].includes(user.role) : false;

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (assigneeFilter !== "all") params.set("assignedToUserId", assigneeFilter);
    const res = await fetch(`/api/export/tasks?${params.toString()}`, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowAdd(false);
      toast({ title: "Task created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addMutation.mutate({
      physicianId: fd.get("physicianId"),
      assignedToUserId: fd.get("assignedToUserId") || user?.id,
      dueAt: new Date(fd.get("dueAt") as string).toISOString(),
      priority: fd.get("priority") || "MEDIUM",
      description: fd.get("description"),
    });
  };

  const hasActiveFilters = statusFilter !== "all" || priorityFilter !== "all" || assigneeFilter !== "all" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setAssigneeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filtered = tasks?.filter(t => {
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    const matchAssignee = assigneeFilter === "all" || t.assignedToUserId === assigneeFilter;
    const dueDate = t.dueAt ? startOfDay(new Date(t.dueAt)) : null;
    const matchDateFrom = !dateFrom || (dueDate && !isBefore(dueDate, startOfDay(parseISO(dateFrom))));
    const matchDateTo = !dateTo || (dueDate && !isAfter(dueDate, endOfDay(parseISO(dateTo))));
    return matchStatus && matchPriority && matchAssignee && matchDateFrom && matchDateTo;
  })?.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()) || [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-tasks-title">Tasks</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Follow-up work queue</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        {canExport && (
          <Button variant="outline" onClick={handleExport} data-testid="button-export-tasks">
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
        )}
        {canCreate && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-task"><Plus className="w-4 h-4 mr-2" />New Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Referring Provider *</Label>
                  <select name="physicianId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-task-physician">
                    <option value="">Select referring provider...</option>
                    {physicians?.map(p => <option key={p.id} value={p.id}>Dr. {p.firstName} {p.lastName}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description *</Label>
                  <Textarea name="description" required placeholder="What needs to be done?" data-testid="input-task-description" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Due Date *</Label>
                    <Input name="dueAt" type="datetime-local" required data-testid="input-task-due" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <select name="priority" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-task-priority">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Assign To</Label>
                  <select name="assignedToUserId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-task-assignee">
                    <option value="">Myself</option>
                    {users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-task">
                    {addMutation.isPending ? "Creating..." : "Create Task"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-task-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="DONE">Done</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-task-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-filter-task-assignee">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            {users?.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
            data-testid="input-filter-task-date-from"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px]"
            data-testid="input-filter-task-date-to"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-task-filters">
            <X className="w-3 h-3 mr-1" />Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">No tasks found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const phys = physicians?.find(p => p.id === t.physicianId);
            const assignee = users?.find(u => u.id === t.assignedToUserId);
            const overdue = t.status === "OPEN" && isPast(new Date(t.dueAt));
            return (
              <Card key={t.id} data-testid={`card-task-${t.id}`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <button
                    className="mt-0.5 shrink-0"
                    onClick={() => toggleMutation.mutate({ id: t.id, status: t.status === "OPEN" ? "DONE" : "OPEN" })}
                    data-testid={`button-toggle-task-${t.id}`}
                  >
                    {t.status === "DONE" ? (
                      <CheckCircle2 className="w-5 h-5 text-chart-4" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${t.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>{t.description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {phys && <span className="text-xs text-muted-foreground">Dr. {phys.firstName} {phys.lastName}</span>}
                      <span className={`text-xs ${overdue ? "text-chart-5 font-medium" : "text-muted-foreground"}`}>
                        Due {format(new Date(t.dueAt), "MMM d, yyyy")}
                      </span>
                      {assignee && <span className="text-xs text-muted-foreground">&middot; {assignee.name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {overdue && <Badge variant="outline" className="bg-chart-5/10 text-chart-5 text-[10px]">Overdue</Badge>}
                    <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
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
