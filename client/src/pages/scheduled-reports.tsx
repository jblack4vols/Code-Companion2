import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, Plus, Trash2, Play, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ScheduledReport } from "@shared/schema";

const reportTypeLabels: Record<string, string> = {
  referral_summary: "Referral Summary",
  interaction_summary: "Interaction Summary",
  provider_pipeline: "Provider Pipeline",
};

const frequencyLabels: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
};

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "Never";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ScheduledReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: reports, isLoading } = useQuery<ScheduledReport[]>({ queryKey: ["/api/scheduled-reports"] });
  const [showAdd, setShowAdd] = useState(false);
  const [deleteReport, setDeleteReport] = useState<ScheduledReport | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formFrequency, setFormFrequency] = useState("weekly");
  const [formReportType, setFormReportType] = useState("referral_summary");
  const [formRecipients, setFormRecipients] = useState("");

  const isAllowed = user?.role === "OWNER" || user?.role === "DIRECTOR";

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; frequency: string; reportType: string; recipients: string }) => {
      const res = await apiRequest("POST", "/api/scheduled-reports", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-reports"] });
      toast({ title: "Report schedule created" });
      setShowAdd(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/scheduled-reports/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-reports"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/scheduled-reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-reports"] });
      toast({ title: "Report schedule deleted" });
      setDeleteReport(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setFormName("");
    setFormFrequency("weekly");
    setFormReportType("referral_summary");
    setFormRecipients("");
  }

  async function handleRunNow(report: ScheduledReport) {
    setRunningId(report.id);
    try {
      const res = await fetch(`/api/scheduled-reports/${report.id}/run`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to run report");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `report_${new Date().toISOString().slice(0, 10)}.csv`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-reports"] });
      toast({ title: "Report downloaded" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formRecipients.trim()) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: formName.trim(),
      frequency: formFrequency,
      reportType: formReportType,
      recipients: formRecipients.trim(),
    });
  }

  if (!isAllowed) {
    return (
      <div className="p-4 sm:p-6 flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground" data-testid="text-no-permission">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarClock className="w-6 h-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Scheduled Reports</h1>
            <p className="text-sm text-muted-foreground">Configure automated report generation and delivery</p>
          </div>
        </div>
        <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-report">
              <Plus className="w-4 h-4 mr-2" />
              Add Report Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Report Schedule</DialogTitle>
              <DialogDescription>Configure a new scheduled report for automated generation.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-name">Name</Label>
                <Input
                  id="report-name"
                  data-testid="input-report-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Weekly Referral Report"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-frequency">Frequency</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger data-testid="select-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-type">Report Type</Label>
                <Select value={formReportType} onValueChange={setFormReportType}>
                  <SelectTrigger data-testid="select-report-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="referral_summary">Referral Summary</SelectItem>
                    <SelectItem value="interaction_summary">Interaction Summary</SelectItem>
                    <SelectItem value="provider_pipeline">Provider Pipeline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-recipients">Recipients</Label>
                <Input
                  id="report-recipients"
                  data-testid="input-recipients"
                  value={formRecipients}
                  onChange={(e) => setFormRecipients(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                />
                <p className="text-xs text-muted-foreground">Comma-separated email addresses</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowAdd(false); resetForm(); }} data-testid="button-cancel-add">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-report">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !reports || reports.length === 0 ? (
            <div className="p-8 text-center">
              <CalendarClock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground" data-testid="text-empty-state">No scheduled reports configured yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Add Report Schedule" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                    <TableCell className="font-medium" data-testid={`text-report-name-${report.id}`}>{report.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs" data-testid={`badge-report-type-${report.id}`}>
                        {reportTypeLabels[report.reportType] || report.reportType}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-frequency-${report.id}`}>
                      {frequencyLabels[report.frequency] || report.frequency}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground" data-testid={`text-recipients-${report.id}`}>
                      {report.recipients}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-last-run-${report.id}`}>
                      {formatDate(report.lastRunAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-next-run-${report.id}`}>
                      {formatDate(report.nextRunAt)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={report.isActive ?? true}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: report.id, isActive: checked })}
                        data-testid={`switch-active-${report.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRunNow(report)}
                          disabled={runningId === report.id}
                          aria-label={`Run ${report.name} now`}
                          data-testid={`button-run-${report.id}`}
                        >
                          {runningId === report.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteReport(report)}
                          aria-label={`Delete ${report.name}`}
                          data-testid={`button-delete-${report.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteReport} onOpenChange={(open) => { if (!open) setDeleteReport(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteReport?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteReport && deleteMutation.mutate(deleteReport.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
