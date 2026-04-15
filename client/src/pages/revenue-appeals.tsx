/**
 * Revenue Appeals — appeal lifecycle management with status updates and outcome recording.
 * Gated to OWNER/DIRECTOR/ANALYST.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Scale, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt$(n: number) {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) { return (n || 0).toFixed(1) + "%"; }

const APPEAL_STATUSES = ["ALL", "DRAFTED", "SUBMITTED", "WON", "LOST", "EXPIRED"];

function statusBadgeClass(s: string) {
  if (s === "WON") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (s === "LOST" || s === "EXPIRED") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (s === "SUBMITTED") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  return "bg-muted text-muted-foreground";
}

export default function RevenueAppealsPage() {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeAppealId, setOutcomeAppealId] = useState<string | null>(null);
  const [outcomeStatus, setOutcomeStatus] = useState<"WON" | "LOST">("WON");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeAmount, setOutcomeAmount] = useState("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", "50");
  if (statusFilter !== "ALL") params.set("status", statusFilter);

  interface AppealItem { id: string; claimId: string; status: string; createdAt: string; submittedAt?: string; recoveredAmount?: string; claim?: { claimNumber: string; payer: string }; }
  interface AppealsResult { data: AppealItem[]; total: number; }
  interface AppealsStats { total: number; winRate: number; totalRecovered: number; avgRecovered: number; }
  const { data, isLoading } = useQuery<AppealsResult>({
    queryKey: ["/api/revenue/appeals", params.toString()],
    queryFn: () =>
      fetch(`/api/revenue/appeals?${params.toString()}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: stats } = useQuery<AppealsStats>({
    queryKey: ["/api/revenue/appeals/stats"],
    queryFn: () =>
      fetch("/api/revenue/appeals/stats", { credentials: "include" }).then(r => r.json()),
  });

  const submitMutation = useMutation({
    mutationFn: async (appealId: string) => {
      const res = await apiRequest("PATCH", `/api/revenue/appeals/${appealId}`, { status: "SUBMITTED" });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Appeal submitted" });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/appeals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/appeals/stats"] });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const outcomeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/revenue/appeals/${outcomeAppealId}`, {
        status: outcomeStatus,
        notes: outcomeNotes || undefined,
        recoveredAmount: outcomeStatus === "WON" && outcomeAmount ? parseFloat(outcomeAmount) : undefined,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: `Appeal marked as ${outcomeStatus}` });
      setOutcomeDialogOpen(false);
      setOutcomeNotes("");
      setOutcomeAmount("");
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/appeals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/appeals/stats"] });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  function openOutcomeDialog(appealId: string, status: "WON" | "LOST") {
    setOutcomeAppealId(appealId);
    setOutcomeStatus(status);
    setOutcomeNotes("");
    setOutcomeAmount("");
    setOutcomeDialogOpen(true);
  }

  const appeals = data?.data || [];
  const total: number = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const kpis = [
    { label: "Total Appeals", value: String(stats?.total ?? 0) },
    { label: "Win Rate", value: fmtPct(stats?.winRate ?? 0) },
    { label: "Total Recovered", value: fmt$(stats?.totalRecovered ?? 0) },
    { label: "Avg Recovery", value: fmt$(stats?.avgRecovered ?? 0) },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Scale className="w-6 h-6" /> Appeals
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage appeal lifecycle from draft to outcome.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-bold mt-0.5">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm shrink-0">Filter by status:</Label>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPEAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} appeal{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Appeals Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Recovered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appeals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10 text-sm">
                        No appeals found. Generate appeals from the Claims page.
                      </TableCell>
                    </TableRow>
                  ) : (
                    appeals.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">{a.claim?.claimNumber || a.claimId?.slice(0, 8)}</TableCell>
                        <TableCell className="text-sm">{a.claim?.payer || "—"}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${statusBadgeClass(a.status)}`}>{a.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-sm">{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {a.recoveredAmount ? fmt$(parseFloat(a.recoveredAmount)) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {a.status === "DRAFTED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs"
                                onClick={() => submitMutation.mutate(a.id)}
                                disabled={submitMutation.isPending}
                              >
                                Submit
                              </Button>
                            )}
                            {a.status === "SUBMITTED" && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-6 text-xs bg-green-600 text-white"
                                  onClick={() => openOutcomeDialog(a.id, "WON")}
                                >
                                  Won
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 text-xs"
                                  onClick={() => openOutcomeDialog(a.id, "LOST")}
                                >
                                  Lost
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Outcome Dialog */}
      <Dialog open={outcomeDialogOpen} onOpenChange={setOutcomeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Appeal Outcome — {outcomeStatus}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {outcomeStatus === "WON" && (
              <div className="space-y-1.5">
                <Label className="text-sm">Amount Recovered ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={outcomeAmount}
                  onChange={e => setOutcomeAmount(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Notes (optional)</Label>
              <Textarea
                placeholder="Add outcome notes..."
                value={outcomeNotes}
                onChange={e => setOutcomeNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcomeDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => outcomeMutation.mutate()}
              disabled={outcomeMutation.isPending}
              className={outcomeStatus === "WON" ? "bg-green-600 text-white" : ""}
              variant={outcomeStatus === "LOST" ? "destructive" : "default"}
            >
              {outcomeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mark as {outcomeStatus}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
