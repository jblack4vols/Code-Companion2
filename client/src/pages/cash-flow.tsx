/**
 * Cash Flow Projection page — 13-week rolling projection with scenario management.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DollarSign, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CashFlowScenarioEditor } from "./cash-flow-scenario-editor";
import type { Location } from "@shared/schema";

interface WeekRow {
  weekStart: string;
  isProjected: boolean;
  grossRevenue: number;
  totalVisits: number;
  labor: number;
  rent: number;
  supplies: number;
  other: number;
  totalExpenses: number;
  netCash: number;
  cumulativeNet: number;
}

interface Scenario {
  id: number;
  name: string;
  weeklyVisits: number;
  rpv: number;
  laborPct: number;
  weeklyRent: number;
  weeklySupplies: number;
  weeklyOther: number;
}

interface ProjectionData {
  weeks: WeekRow[];
  scenario: Scenario;
  locationId: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const TABLE_ROWS: { label: string; key: keyof WeekRow }[] = [
  { label: "Gross Revenue", key: "grossRevenue" },
  { label: "Total Visits", key: "totalVisits" },
  { label: "Labor", key: "labor" },
  { label: "Rent", key: "rent" },
  { label: "Supplies", key: "supplies" },
  { label: "Other", key: "other" },
  { label: "Total Expenses", key: "totalExpenses" },
  { label: "Net Cash", key: "netCash" },
  { label: "Cumulative Net", key: "cumulativeNet" },
];

const CURRENCY_KEYS = new Set(["grossRevenue", "labor", "rent", "supplies", "other", "totalExpenses", "netCash", "cumulativeNet"]);

export default function CashFlowPage() {
  const { toast } = useToast();
  const [locationId, setLocationId] = useState("all");
  const [scenarioId, setScenarioId] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: scenarios, isLoading: scenariosLoading } = useQuery<Scenario[]>({ queryKey: ["/api/cash-flow/scenarios"] });

  const activeScenarioId = scenarioId || (scenarios && scenarios.length > 0 ? String(scenarios[0].id) : "");
  const activeScenario = scenarios?.find(s => String(s.id) === activeScenarioId) ?? null;

  const projectionKey = activeScenarioId
    ? ["/api/cash-flow/projection", activeScenarioId, locationId]
    : null;

  const { data: projection, isLoading: projLoading } = useQuery<ProjectionData>({
    queryKey: projectionKey ?? ["__disabled__"],
    enabled: !!activeScenarioId,
    queryFn: async () => {
      const params = new URLSearchParams({ scenarioId: activeScenarioId });
      if (locationId !== "all") params.set("locationId", locationId);
      const res = await fetch(`/api/cash-flow/projection?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/cash-flow/scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-flow/scenarios"] });
      setScenarioId("");
      toast({ title: "Scenario deleted" });
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const baselineMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cash-flow/scenarios/default"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-flow/scenarios"] });
      toast({ title: "Baseline scenario generated" });
    },
    onError: (err: Error) => toast({ title: "Failed to generate baseline", description: err.message, variant: "destructive" }),
  });

  const weeks = projection?.weeks ?? [];
  const totalRevenue = weeks.reduce((s, w) => s + w.grossRevenue, 0);
  const totalExpenses = weeks.reduce((s, w) => s + w.totalExpenses, 0);
  const netCash = weeks.reduce((s, w) => s + w.netCash, 0);
  const avgWeeklyNet = weeks.length ? netCash / weeks.length : 0;

  const isLoading = scenariosLoading || (!!activeScenarioId && projLoading);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold" data-testid="text-cashflow-title">Cash Flow Projection</h1>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="w-44" data-testid="select-location"><SelectValue placeholder="All Locations" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations?.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Scenario bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {scenarios && scenarios.length > 0 ? (
          <>
            <Select value={activeScenarioId} onValueChange={setScenarioId}>
              <SelectTrigger className="w-52" data-testid="select-scenario"><SelectValue placeholder="Select scenario" /></SelectTrigger>
              <SelectContent>{scenarios.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => { setEditingScenario(null); setEditorOpen(true); }} data-testid="button-new-scenario"><Plus className="w-3.5 h-3.5 mr-1" />New</Button>
            {activeScenario && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setEditingScenario(activeScenario); setEditorOpen(true); }} data-testid="button-edit-scenario"><Pencil className="w-3.5 h-3.5 mr-1" />Edit</Button>
                <Button size="sm" variant="outline" onClick={() => { if (window.confirm(`Delete scenario "${activeScenario.name}"?`)) deleteMutation.mutate(activeScenario.id); }} disabled={deleteMutation.isPending} data-testid="button-delete-scenario"><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</Button>
              </>
            )}
          </>
        ) : (
          <Button size="sm" onClick={() => baselineMutation.mutate()} disabled={baselineMutation.isPending} data-testid="button-generate-baseline">
            {baselineMutation.isPending ? "Generating..." : "Generate Baseline"}
          </Button>
        )}
      </div>

      {/* Stat cards */}
      {weeks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Revenue", value: fmt(totalRevenue), icon: DollarSign, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/15", testid: "card-total-revenue" },
            { label: "Total Expenses", value: fmt(totalExpenses), icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/15", testid: "card-total-expenses" },
            { label: "Net Cash", value: fmt(netCash), icon: netCash >= 0 ? TrendingUp : TrendingDown, color: netCash >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive", bg: netCash >= 0 ? "bg-green-500/15" : "bg-red-500/15", testid: "card-net-cash" },
            { label: "Avg Weekly Net", value: fmt(avgWeeklyNet), icon: BarChart3, color: "text-chart-1", bg: "bg-chart-1/15", testid: "card-avg-weekly-net" },
          ].map(({ label, value, icon: Icon, color, bg, testid }) => (
            <Card key={label} data-testid={testid}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${bg} ${color}`}><Icon className="w-4 h-4" /></div>
                <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold tabular-nums">{value}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 13-week table */}
      {weeks.length > 0 ? (
        <Card data-testid="card-projection-table">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 w-36 text-xs">Week</TableHead>
                  {weeks.map(w => (
                    <TableHead key={w.weekStart} className={`text-right text-xs whitespace-nowrap ${w.isProjected ? "bg-muted/30" : ""}`}>
                      {new Date(w.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {w.isProjected && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">P</Badge>}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {TABLE_ROWS.map(({ label, key }) => (
                  <TableRow key={key}>
                    <TableCell className="sticky left-0 bg-background z-10 text-xs font-medium py-1.5">{label}</TableCell>
                    {weeks.map(w => {
                      const val = w[key] as number;
                      const isNet = key === "netCash" || key === "cumulativeNet";
                      const netClass = isNet ? (val >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive") : "";
                      return (
                        <TableCell key={w.weekStart} className={`text-right tabular-nums text-xs py-1.5 ${w.isProjected ? "bg-muted/30" : ""} ${netClass}`}>
                          {CURRENCY_KEYS.has(key) ? fmt(val) : val.toLocaleString("en-US")}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : activeScenarioId ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm" data-testid="text-no-data">No projection data available for this scenario.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm" data-testid="text-select-scenario">Select or create a scenario to view the projection.</CardContent></Card>
      )}

      <CashFlowScenarioEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        scenario={editingScenario}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/cash-flow/scenarios"] })}
      />
    </div>
  );
}
