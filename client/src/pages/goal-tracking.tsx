import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, Trash2, TrendingUp, CheckCircle, BarChart3 } from "lucide-react";
import { format } from "date-fns";

interface GoalProgress {
  id: string;
  month: string;
  scopeType: "TERRITORY" | "LOCATION";
  scopeId: string;
  targetReferrals: number;
  targetRevenue: string | null;
  scopeName: string;
  actualReferrals: number;
  actualRevenue: number;
  progressPct: number;
}

function getProgressColor(pct: number) {
  if (pct >= 80) return "bg-green-500 dark:bg-green-400";
  if (pct >= 50) return "bg-amber-500 dark:bg-amber-400";
  return "bg-red-500 dark:bg-red-400";
}

function getProgressTextColor(pct: number) {
  if (pct >= 80) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getProgressTrackColor(pct: number) {
  if (pct >= 80) return "bg-green-100 dark:bg-green-950";
  if (pct >= 50) return "bg-amber-100 dark:bg-amber-950";
  return "bg-red-100 dark:bg-red-950";
}

export default function GoalTrackingPage() {
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scopeType, setScopeType] = useState<"TERRITORY" | "LOCATION">("TERRITORY");
  const [scopeId, setScopeId] = useState("");
  const [targetReferrals, setTargetReferrals] = useState("");
  const [targetRevenue, setTargetRevenue] = useState("");

  const monthParam = selectedMonth + "-01";

  const { data: progress, isLoading: loadingProgress } = useQuery<GoalProgress[]>({
    queryKey: ["/api/goals/progress", `?month=${monthParam}`],
  });

  const { data: territories } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/territories"],
  });

  const { data: locations } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/locations"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { month: string; scopeType: string; scopeId: string; targetReferrals: number; targetRevenue?: number }) => {
      await apiRequest("POST", "/api/goals", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals/progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      toast({ title: "Goal saved", description: "Your goal has been created or updated." });
      resetForm();
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals/progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      toast({ title: "Goal deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setScopeType("TERRITORY");
    setScopeId("");
    setTargetReferrals("");
    setTargetRevenue("");
  };

  const handleSubmit = () => {
    if (!scopeId || !targetReferrals) {
      toast({ title: "Missing fields", description: "Please select a scope and set target referrals.", variant: "destructive" });
      return;
    }
    const payload: any = {
      month: monthParam,
      scopeType,
      scopeId,
      targetReferrals: parseInt(targetReferrals, 10),
    };
    if (targetRevenue) {
      payload.targetRevenue = parseFloat(targetRevenue);
    }
    createMutation.mutate(payload);
  };

  const scopeOptions = scopeType === "TERRITORY" ? territories : locations;

  const totalGoals = progress?.length || 0;
  const avgProgress = totalGoals > 0 ? Math.round((progress!.reduce((sum, g) => sum + g.progressPct, 0)) / totalGoals) : 0;
  const onTrackCount = progress?.filter(g => g.progressPct >= 80).length || 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-goal-tracking-title">Goal Tracking</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Set monthly referral targets and track progress</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-44"
            data-testid="input-month-picker"
          />
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-goal">
                <Plus className="w-4 h-4 mr-1" />
                Add Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Goal</DialogTitle>
                <DialogDescription>Set a monthly referral target for a territory or location</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Scope Type</Label>
                  <Select value={scopeType} onValueChange={(v) => { setScopeType(v as "TERRITORY" | "LOCATION"); setScopeId(""); }}>
                    <SelectTrigger data-testid="select-scope-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TERRITORY">Territory</SelectItem>
                      <SelectItem value="LOCATION">Location</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{scopeType === "TERRITORY" ? "Territory" : "Location"}</Label>
                  <Select value={scopeId} onValueChange={setScopeId}>
                    <SelectTrigger data-testid="select-scope-id">
                      <SelectValue placeholder={`Select ${scopeType === "TERRITORY" ? "territory" : "location"}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {scopeOptions?.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Target Referrals</Label>
                  <Input
                    type="number"
                    min="0"
                    value={targetReferrals}
                    onChange={(e) => setTargetReferrals(e.target.value)}
                    placeholder="e.g. 50"
                    data-testid="input-target-referrals"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Target Revenue (optional)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetRevenue}
                    onChange={(e) => setTargetRevenue(e.target.value)}
                    placeholder="e.g. 25000"
                    data-testid="input-target-revenue"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  data-testid="button-save-goal"
                >
                  {createMutation.isPending ? "Saving..." : "Save Goal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
              <Target className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Total Goals</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-total-goals">{totalGoals}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Avg Progress</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-avg-progress">{avgProgress}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-green-500/15 text-green-600 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">On Track</p>
              <p className="text-2xl font-bold mt-0.5" data-testid="text-on-track">{onTrackCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loadingProgress ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-28 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : progress && progress.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {progress.map((goal) => (
            <Card key={goal.id} data-testid={`card-goal-${goal.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" data-testid={`text-scope-name-${goal.id}`}>{goal.scopeName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {goal.scopeType === "TERRITORY" ? "Territory" : "Location"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-lg font-bold ${getProgressTextColor(goal.progressPct)}`} data-testid={`text-progress-pct-${goal.id}`}>
                      {goal.progressPct}%
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(goal.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-goal-${goal.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className={`relative h-3 w-full overflow-hidden rounded-full ${getProgressTrackColor(goal.progressPct)}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getProgressColor(goal.progressPct)}`}
                      style={{ width: `${Math.min(goal.progressPct, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                  <span data-testid={`text-referrals-${goal.id}`}>
                    Referrals: <span className="font-medium text-foreground">{goal.actualReferrals}</span> / {goal.targetReferrals}
                  </span>
                  {goal.targetRevenue && (
                    <span data-testid={`text-revenue-${goal.id}`}>
                      Revenue: <span className="font-medium text-foreground">${goal.actualRevenue.toLocaleString()}</span> / ${parseFloat(goal.targetRevenue).toLocaleString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <Target className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium" data-testid="text-no-goals">No goals set for this month</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Goal" to create your first monthly target</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
