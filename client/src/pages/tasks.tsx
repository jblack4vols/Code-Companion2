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
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, ClipboardList, CheckCircle2, Circle } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Task, Physician, User } from "@shared/schema";
import { format, isPast } from "date-fns";

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");
  const [showAdd, setShowAdd] = useState(false);

  const { data: tasks, isLoading } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const canCreate = user ? hasPermission(user.role, "create", "interaction") : false;

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

  const filtered = tasks?.filter(t => {
    return statusFilter === "all" || t.status === statusFilter;
  })?.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()) || [];

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tasks-title">Tasks</h1>
          <p className="text-sm text-muted-foreground">Follow-up work queue</p>
        </div>
        {canCreate && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-task"><Plus className="w-4 h-4 mr-2" />New Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Physician *</Label>
                  <select name="physicianId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-task-physician">
                    <option value="">Select physician...</option>
                    {physicians?.map(p => <option key={p.id} value={p.id}>Dr. {p.firstName} {p.lastName}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description *</Label>
                  <Textarea name="description" required placeholder="What needs to be done?" data-testid="input-task-description" />
                </div>
                <div className="grid grid-cols-2 gap-3">
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

      <div className="flex items-center gap-3">
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
