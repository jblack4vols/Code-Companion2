/**
 * Revenue Claims — paginated claims list with filters, underpaid highlight, and appeal generation.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { FileText, Upload, Scale, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

function fmt$(n: number | string | null) {
  const v = parseFloat(String(n ?? 0)) || 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CLAIM_STATUSES = ["ALL", "PENDING", "SUBMITTED", "PAID", "PARTIAL", "DENIED", "APPEALED", "CLOSED"];

export default function RevenueClaimsPage() {
  const { toast } = useToast();

  const [payer, setPayer] = useState("");
  const [status, setStatus] = useState("ALL");
  const [underpaidOnly, setUnderpaidOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [appealDialogOpen, setAppealDialogOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", "50");
  if (payer) params.set("payer", payer);
  if (status !== "ALL") params.set("status", status);
  if (underpaidOnly) params.set("isUnderpaid", "true");
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  interface ClaimItem { id: string; claimNumber: string; dos: string; payer?: string; cptCodes?: string; billedAmount: number | string | null; paidAmount: number | string | null; expectedAmount?: number | string | null; status: string; isUnderpaid?: boolean; }
  interface ClaimsResult { data: ClaimItem[]; total: number; }
  interface AppealTemplate { id: string; name: string; }
  const { data, isLoading } = useQuery<ClaimsResult>({
    queryKey: ["/api/revenue/claims", params.toString()],
    queryFn: () =>
      fetch(`/api/revenue/claims?${params.toString()}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: templates } = useQuery<AppealTemplate[]>({
    queryKey: ["/api/revenue/appeal-templates"],
    queryFn: () =>
      fetch("/api/revenue/appeal-templates?activeOnly=true", { credentials: "include" }).then(r => r.json()),
  });

  const appealMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/revenue/appeals/generate", { claimId: selectedClaimId, templateId: selectedTemplateId || undefined });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to generate appeal");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Appeal generated", description: "Appeal drafted successfully." });
      setAppealDialogOpen(false);
      setSelectedClaimId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/appeals"] });
    },
    onError: (err: unknown) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    },
  });

  const claims = data?.data || [];
  const total: number = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  function openAppeal(claimId: string) {
    setSelectedClaimId(claimId);
    setSelectedTemplateId("");
    setAppealDialogOpen(true);
  }

  function varianceColor(variance: number) {
    if (variance > 0) return "text-red-600 font-medium";
    return "text-muted-foreground";
  }

  function statusBadgeClass(s: string) {
    if (s === "DENIED") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (s === "PAID") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (s === "PARTIAL") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-muted text-muted-foreground";
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="w-6 h-6" /> Claims
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} claim{total !== 1 ? "s" : ""} found
          </p>
        </div>
        <Link href="/revenue/import">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import Claims
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Payer</Label>
              <Input
                placeholder="Filter by payer..."
                value={payer}
                onChange={e => { setPayer(e.target.value); setPage(1); }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLAIM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                id="underpaid-toggle"
                checked={underpaidOnly}
                onCheckedChange={v => { setUnderpaidOnly(v); setPage(1); }}
              />
              <Label htmlFor="underpaid-toggle" className="text-xs cursor-pointer">Underpaid Only</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Claims Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>DOS</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>CPT</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                        No claims found. Adjust filters or import claim data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    claims.map((c) => {
                      const expected = parseFloat(String(c.expectedAmount ?? 0));
                      const paid = parseFloat(String(c.paidAmount ?? 0));
                      const variance = expected > 0 ? expected - paid : 0;
                      const canAppeal = c.status === "DENIED" || c.isUnderpaid;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.claimNumber}</TableCell>
                          <TableCell className="text-sm">{c.dos}</TableCell>
                          <TableCell className="text-sm max-w-[120px] truncate">{c.payer || "—"}</TableCell>
                          <TableCell className="text-xs">{c.cptCodes || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt$(c.billedAmount)}</TableCell>
                          <TableCell className="text-right text-sm">{fmt$(c.paidAmount)}</TableCell>
                          <TableCell className="text-right text-sm">{expected > 0 ? fmt$(expected) : "—"}</TableCell>
                          <TableCell className={`text-right text-sm ${varianceColor(variance)}`}>
                            {variance > 0 ? fmt$(variance) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${statusBadgeClass(c.status)}`}>
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {canAppeal && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs gap-1"
                                onClick={() => openAppeal(c.id)}
                              >
                                <Scale className="w-3 h-3" /> Appeal
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
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

      {/* Appeal Generation Dialog */}
      <Dialog open={appealDialogOpen} onOpenChange={setAppealDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Appeal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Template (optional)</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto-select best template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Auto-select</SelectItem>
                  {(templates || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppealDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => appealMutation.mutate()}
              disabled={appealMutation.isPending}
            >
              {appealMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Generate Appeal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
