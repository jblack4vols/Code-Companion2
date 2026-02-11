import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Stethoscope, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Physician, User } from "@shared/schema";
import { format } from "date-fns";
import { Link } from "wouter";

const stageBadge: Record<string, string> = {
  NEW: "bg-chart-1/15 text-chart-1",
  DEVELOPING: "bg-chart-3/15 text-chart-3",
  STRONG: "bg-chart-4/15 text-chart-4",
  AT_RISK: "bg-chart-5/15 text-chart-5",
};

const priorityBadge: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground",
  MEDIUM: "bg-chart-3/15 text-chart-3",
  HIGH: "bg-chart-5/15 text-chart-5",
};

const statusBadge: Record<string, string> = {
  PROSPECT: "bg-chart-1/15 text-chart-1",
  ACTIVE: "bg-chart-4/15 text-chart-4",
  INACTIVE: "bg-muted text-muted-foreground",
};

export default function PhysiciansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(urlParams.get("status") || "all");
  const [stageFilter, setStageFilter] = useState<string>(urlParams.get("stage") || "all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: physicians, isLoading } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const canEdit = user ? hasPermission(user.role, "edit", "physician") : false;
  const canCreate = user ? hasPermission(user.role, "create", "physician") : false;

  const filtered = useMemo(() => physicians?.filter(p => {
    const matchSearch = search === "" ||
      `${p.firstName} ${p.lastName} ${p.practiceName || ""} ${p.specialty || ""} ${p.credentials || ""} ${p.npi || ""} ${p.city || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchStage = stageFilter === "all" || p.relationshipStage === stageFilter;
    const matchPriority = priorityFilter === "all" || p.priority === priorityFilter;
    return matchSearch && matchStatus && matchStage && matchPriority;
  }) || [], [physicians, search, statusFilter, stageFilter, priorityFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const safeSetPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages || 1)));

  useEffect(() => { if (page > totalPages && totalPages > 0) setPage(1); }, [filtered.length, page, totalPages]);

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/physicians", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setShowAdd(false);
      toast({ title: "Physician added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addMutation.mutate({
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      credentials: fd.get("credentials") || undefined,
      specialty: fd.get("specialty") || undefined,
      practiceName: fd.get("practiceName") || undefined,
      phone: fd.get("phone") || undefined,
      email: fd.get("email") || undefined,
      city: fd.get("city") || undefined,
      state: fd.get("state") || undefined,
      status: fd.get("status") || "PROSPECT",
      priority: fd.get("priority") || "MEDIUM",
      relationshipStage: fd.get("relationshipStage") || "NEW",
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-physicians-title">Physicians</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage your physician referral sources</p>
        </div>
        {canCreate && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-physician"><Plus className="w-4 h-4 mr-2" />Add Physician</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Physician</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input id="firstName" name="firstName" required data-testid="input-physician-first-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input id="lastName" name="lastName" required data-testid="input-physician-last-name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="credentials">Credentials</Label>
                    <Input id="credentials" name="credentials" placeholder="M.D., DO, NP, etc." data-testid="input-physician-credentials" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="specialty">Specialty</Label>
                    <Input id="specialty" name="specialty" placeholder="Orthopedics" data-testid="input-physician-specialty" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="practiceName">Practice Name</Label>
                  <Input id="practiceName" name="practiceName" data-testid="input-physician-practice" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" data-testid="input-physician-phone" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" data-testid="input-physician-email" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" name="city" data-testid="input-physician-city" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" name="state" data-testid="input-physician-state" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <select name="status" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-physician-status">
                      <option value="PROSPECT">Prospect</option>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Stage</Label>
                    <select name="relationshipStage" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-physician-stage">
                      <option value="NEW">New</option>
                      <option value="DEVELOPING">Developing</option>
                      <option value="STRONG">Strong</option>
                      <option value="AT_RISK">At Risk</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority</Label>
                    <select name="priority" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-physician-priority">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-physician">
                    {addMutation.isPending ? "Adding..." : "Add Physician"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search physicians..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-physicians"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="PROSPECT">Prospect</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-stage">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="NEW">New</SelectItem>
            <SelectItem value="DEVELOPING">Developing</SelectItem>
            <SelectItem value="STRONG">Strong</SelectItem>
            <SelectItem value="AT_RISK">At Risk</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-filter-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Stethoscope className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No physicians found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Provider</TableHead>
                    <TableHead>Credentials</TableHead>
                    <TableHead>Practice</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(p => {
                    const owner = users?.find(u => u.id === p.assignedOwnerId);
                    return (
                      <TableRow key={p.id} className="hover-elevate cursor-pointer" data-testid={`row-physician-${p.id}`}>
                        <TableCell>
                          <Link href={`/physicians/${p.id}`} className="block">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                                {p.firstName[0]}{p.lastName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-medium" data-testid={`text-physician-name-${p.id}`}>{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                                {owner && <p className="text-xs text-muted-foreground">{owner.name}</p>}
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" data-testid={`text-physician-credentials-${p.id}`}>{p.credentials || "-"}</TableCell>
                        <TableCell className="text-sm">{p.practiceName || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[p.city, p.state].filter(Boolean).join(", ") || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${statusBadge[p.status]}`}>{p.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${stageBadge[p.relationshipStage]}`}>
                            {p.relationshipStage.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${priorityBadge[p.priority]}`}>{p.priority}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" data-testid="text-physician-count">{filtered.length} of {physicians?.length || 0} providers</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => safeSetPage(page - 1)}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="text-page-info">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => safeSetPage(page + 1)}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
