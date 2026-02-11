import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Stethoscope, ChevronLeft, ChevronRight, X, ArrowUpDown, ArrowUp, ArrowDown, Building2, Users } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Physician, User } from "@shared/schema";
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

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type SortField = "name" | "location" | "status" | "stage" | "priority" | "referrals";

function SortableHead({ label, field, currentSort, currentOrder, onSort, className }: {
  label: string;
  field: SortField;
  currentSort: SortField | "";
  currentOrder: string;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentSort === field;
  return (
    <TableHead className={`cursor-pointer select-none ${className || ""}`} onClick={() => onSort(field)} data-testid={`sort-${field}`}>
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );
}

export default function PhysiciansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(urlParams.get("status") || "all");
  const [stageFilter, setStageFilter] = useState<string>(urlParams.get("stage") || "all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [practiceFilter, setPracticeFilter] = useState<string>(urlParams.get("practice") || "");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPractice, setSelectedPractice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField | "">("");
  const [sortOrder, setSortOrder] = useState<string>("asc");
  const pageSize = 50;

  const debouncedSearch = useDebounce(search, 300);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (stageFilter !== "all") params.set("stage", stageFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (practiceFilter) params.set("practiceName", practiceFilter);
    if (sortBy) {
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
    }
    return params.toString();
  }, [page, debouncedSearch, statusFilter, stageFilter, priorityFilter, practiceFilter, sortBy, sortOrder]);

  const queryParams = buildQueryParams();
  const { data: result, isLoading } = useQuery<any>({
    queryKey: ["/api/physicians/paginated", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/physicians/paginated?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const canCreate = user ? hasPermission(user.role, "create", "physician") : false;

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/physicians", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });
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

  const physicians = result?.data || [];
  const total = result?.total || 0;
  const totalPages = result?.totalPages || 1;

  const hasActiveFilters = statusFilter !== "all" || stageFilter !== "all" || priorityFilter !== "all" || practiceFilter !== "" || search !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setStageFilter("all");
    setPriorityFilter("all");
    setPracticeFilter("");
    setSearch("");
    setPage(1);
  };

  const setPageSafe = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-physicians-title">Physicians</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{total} referring providers</p>
        </div>
        {canCreate && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-physician"><Plus className="w-4 h-4 mr-2" />Add Physician</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Physician</DialogTitle>
                <DialogDescription>Add a new referring provider</DialogDescription>
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
            placeholder="Search name, practice, NPI..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
            data-testid="input-search-physicians"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
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
        <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
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
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
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
        {practiceFilter && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Building2 className="w-3 h-3" />
            {practiceFilter}
            <button onClick={() => { setPracticeFilter(""); setPage(1); }} className="ml-1" data-testid="button-clear-practice-filter">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        )}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="w-3 h-3 mr-1" />Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : physicians.length === 0 ? (
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
                    <SortableHead label="Provider" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="min-w-[180px]" />
                    <TableHead>Credentials</TableHead>
                    <TableHead>Practice</TableHead>
                    <SortableHead label="Location" field="location" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHead label="Status" field="status" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHead label="Stage" field="stage" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHead label="Priority" field="priority" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHead label="Referrals" field="referrals" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {physicians.map((p: any) => {
                    const owner = users?.find((u: User) => u.id === p.assignedOwnerId);
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
                        <TableCell className="text-sm">
                          {p.practiceName ? (
                            <button
                              type="button"
                              className="text-left hover:underline text-primary/80 cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setSelectedPractice(p.practiceName); }}
                              data-testid={`link-practice-${p.id}`}
                            >
                              {p.practiceName}
                            </button>
                          ) : "-"}
                        </TableCell>
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
                        <TableCell className="text-sm text-center" data-testid={`text-referral-count-${p.id}`}>
                          {Number(p.referralCount) > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">{Number(p.referralCount)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
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
        <p className="text-xs text-muted-foreground" data-testid="text-physician-count">{total} providers</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPageSafe(page - 1)} data-testid="button-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="text-page-info">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPageSafe(page + 1)} data-testid="button-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <PracticeDetailDialog
        practiceName={selectedPractice}
        onClose={() => setSelectedPractice(null)}
        onFilterByPractice={(name: string) => { setPracticeFilter(name); setPage(1); setSelectedPractice(null); }}
      />
    </div>
  );
}

function PracticeDetailDialog({ practiceName, onClose, onFilterByPractice }: { practiceName: string | null; onClose: () => void; onFilterByPractice: (name: string) => void }) {
  const { data: result } = useQuery<any>({
    queryKey: ["/api/physicians/paginated", "practice-detail", practiceName],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("practiceName", practiceName!);
      params.set("page", "1");
      params.set("pageSize", "100");
      const res = await fetch(`/api/physicians/paginated?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!practiceName,
  });

  const providers = result?.data || [];

  return (
    <Dialog open={!!practiceName} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-practice-dialog-title">
            <Building2 className="w-4 h-4" />
            {practiceName}
          </DialogTitle>
          <DialogDescription>
            {providers.length} provider{providers.length !== 1 ? "s" : ""} at this practice
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {providers.map((p: any) => (
            <Link key={p.id} href={`/physicians/${p.id}`}>
              <div className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer" data-testid={`practice-provider-${p.id}`}>
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-medium shrink-0">
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{[p.specialty, p.city, p.state].filter(Boolean).join(" \u00b7 ") || "No details"}</p>
                </div>
                <div className="text-right shrink-0">
                  {Number(p.referralCount) > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{Number(p.referralCount)} referrals</Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {providers.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No providers found
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => onFilterByPractice(practiceName!)} data-testid="button-filter-by-practice">
            <Search className="w-3 h-3 mr-1.5" />Show in Table
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
