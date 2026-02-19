import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, MapPin, UserPlus, Search, AlertCircle } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function TerritoriesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canAssign = user ? (user.role === "OWNER" || user.role === "DIRECTOR") : false;
  const [selectedMarketer, setSelectedMarketer] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedPhysicians, setSelectedPhysicians] = useState<string[]>([]);
  const [assignToMarketer, setAssignToMarketer] = useState<string>("");

  const { data: territories, isLoading } = useQuery<any>({
    queryKey: ["/api/territories"],
    queryFn: async () => {
      const res = await fetch("/api/territories", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: marketers } = useQuery<any[]>({
    queryKey: ["/api/marketers"],
    queryFn: async () => {
      const res = await fetch("/api/marketers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const unassignedQuery = useQuery<any>({
    queryKey: ["/api/physicians/paginated", "unassigned", selectedMarketer],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("pageSize", "100");
      params.set("page", "1");
      const res = await fetch(`/api/physicians/paginated?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: showAssignDialog,
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async (data: { physicianIds: string[]; marketerId: string | null }) => {
      const res = await apiRequest("POST", "/api/physicians/bulk-assign", data);
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: "Assigned", description: `${vars.physicianIds.length} referring provider(s) assigned successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/territories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });
      setShowAssignDialog(false);
      setSelectedPhysicians([]);
      setAssignToMarketer("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ physicianId, marketerId }: { physicianId: string; marketerId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/physicians/${physicianId}/assign`, { marketerId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/territories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });
    },
  });

  const terrData = territories?.territories || [];
  const unassignedCount = territories?.unassignedCount || 0;
  const totalPhysicians = territories?.totalPhysicians || 0;

  const allUnassigned = (unassignedQuery.data?.data || []).filter((p: any) => !p.assignedOwnerId);
  const filteredUnassigned = allUnassigned.filter((p: any) => {
    if (!assignSearch) return true;
    const term = assignSearch.toLowerCase();
    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(term) ||
      (p.practiceName || "").toLowerCase().includes(term);
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1,2,3].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-territories-title">Territory Management</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Assign referring providers to marketers and track coverage
          </p>
        </div>
        {canAssign && (
          <Button size="sm" onClick={() => setShowAssignDialog(true)} data-testid="button-bulk-assign">
            <UserPlus className="w-4 h-4 mr-1.5" />
            Assign Referring Providers
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-chart-1/15 text-chart-1 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Referring Providers</p>
              <p className="text-2xl font-bold" data-testid="text-total-physicians">{totalPhysicians}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-chart-4/15 text-chart-4 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Assigned</p>
              <p className="text-2xl font-bold">{totalPhysicians - unassignedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-chart-5/15 text-chart-5 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unassigned</p>
              <p className="text-2xl font-bold" data-testid="text-unassigned-count">{unassignedCount}</p>
              <p className="text-[10px] text-muted-foreground">Coverage gap</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">Marketer Assignments</h3>
            <p className="text-xs text-muted-foreground">Book of business per team member</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Team Member</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs text-right">Assigned Referring Providers</TableHead>
                <TableHead className="text-xs text-right">Coverage %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terrData.map((t: any) => {
                const pct = totalPhysicians > 0 ? Math.round((t.assignedCount / totalPhysicians) * 100) : 0;
                return (
                  <TableRow key={t.marketer.id} data-testid={`row-territory-${t.marketer.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary text-[10px] font-medium shrink-0">
                          {t.marketer.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </div>
                        <span className="text-sm font-medium">{t.marketer.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{t.marketer.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{t.assignedCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-visible">
                          <div className="h-full rounded-full bg-chart-4" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {terrData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-sm text-muted-foreground">
                    No marketers found. Create user accounts with Marketer or Director roles.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Assign Referring Providers</DialogTitle>
            <DialogDescription>Select referring providers and assign them to a marketer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Assign to</label>
              <Select value={assignToMarketer} onValueChange={setAssignToMarketer}>
                <SelectTrigger data-testid="select-assign-marketer">
                  <SelectValue placeholder="Select marketer..." />
                </SelectTrigger>
                <SelectContent>
                  {marketers?.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search unassigned referring providers..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-assign"
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-md p-2">
              {filteredUnassigned.slice(0, 50).map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedPhysicians.includes(p.id)}
                    onCheckedChange={(checked) => {
                      setSelectedPhysicians(prev =>
                        checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                      );
                    }}
                    data-testid={`checkbox-assign-${p.id}`}
                  />
                  <span className="flex-1">{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{p.practiceName || ""}</span>
                </label>
              ))}
              {filteredUnassigned.length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">No unassigned referring providers found</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{selectedPhysicians.length} selected</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={selectedPhysicians.length === 0 || !assignToMarketer || bulkAssignMutation.isPending}
                  onClick={() => bulkAssignMutation.mutate({ physicianIds: selectedPhysicians, marketerId: assignToMarketer })}
                  data-testid="button-confirm-assign"
                >
                  {bulkAssignMutation.isPending ? "Assigning..." : `Assign ${selectedPhysicians.length}`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
