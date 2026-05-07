import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, Sparkles, Merge } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import type { Physician, User, Location } from "@shared/schema";
import { PhysiciansFilters } from "./physicians-filters";
import { PhysiciansBulkActions } from "./physicians-bulk-actions";
import { PhysiciansTable } from "./physicians-table";
import { PracticeDetailDialog } from "./physicians-detail-dialog";
import { PhysiciansAddForm } from "./physicians-add-form";
import { PhysiciansQuickInteractionDialog } from "./physicians-quick-interaction-dialog";
import { PhysiciansEnrichDialog, PhysiciansMergeDialog } from "./physicians-enrich-merge-dialogs";

type SortField = "name" | "location" | "status" | "stage" | "priority" | "referrals";
type PhysicianWithCount = Physician & { referralCount?: number };
type EnrichResult = { total: number; enriched: number; alreadyComplete: number; failed: number };

const invalidatePhysicians = () => queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });

export default function PhysiciansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "all");
  const [stageFilter, setStageFilter] = useState(urlParams.get("stage") || "all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [practiceFilter, setPracticeFilter] = useState(urlParams.get("practice") || "");
  const [showAdd, setShowAdd] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [selectedPractice, setSelectedPractice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField | "">("");
  const [sortOrder, setSortOrder] = useState("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeNpi, setMergeNpi] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showEnrichDialog, setShowEnrichDialog] = useState(false);
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [quickAddPhysician, setQuickAddPhysician] = useState<PhysicianWithCount | null>(null);
  const pageSize = 50;

  const debouncedSearch = useDebounce(search, 300);
  const { data: favoriteIds = [] } = useQuery<string[]>({ queryKey: ["/api/favorites"] });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  const buildQueryParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(page)); p.set("pageSize", String(pageSize));
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (stageFilter !== "all") p.set("stage", stageFilter);
    if (priorityFilter !== "all") p.set("priority", priorityFilter);
    if (practiceFilter) p.set("practiceName", practiceFilter);
    if (sortBy) { p.set("sortBy", sortBy); p.set("sortOrder", sortOrder); }
    return p.toString();
  }, [page, debouncedSearch, statusFilter, stageFilter, priorityFilter, practiceFilter, sortBy, sortOrder]);

  const queryParams = buildQueryParams();
  const { data: result, isLoading, isError, refetch } = useQuery<{ data: PhysicianWithCount[]; total: number; totalPages: number }>({
    queryKey: ["/api/physicians/paginated", queryParams],
    queryFn: async () => { const res = await fetch(`/api/physicians/paginated?${queryParams}`, { credentials: "include" }); if (!res.ok) throw new Error("Failed to fetch"); return res.json(); },
  });

  const canCreate = user ? hasPermission(user.role, "create", "physician") : false;
  const canBulkAction = user ? (user.role === "OWNER" || user.role === "DIRECTOR") : false;
  const allPhysicians = result?.data || [];
  const physicians = showFavoritesOnly ? allPhysicians.filter(p => favoriteIds.includes(p.id)) : allPhysicians;
  const total = showFavoritesOnly ? physicians.length : (result?.total || 0);
  const totalPages = showFavoritesOnly ? 1 : (result?.totalPages || 1);
  const hasActiveFilters = statusFilter !== "all" || stageFilter !== "all" || priorityFilter !== "all" || practiceFilter !== "" || search !== "";

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const toggleFavorite = useMutation({ mutationFn: async (id: string) => { if (favoriteIds.includes(id)) await apiRequest("DELETE", `/api/favorites/${id}`); else await apiRequest("POST", `/api/favorites/${id}`); }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/favorites"] }) });
  const addMutation = useMutation({ mutationFn: async (data: Record<string, unknown>) => (await apiRequest("POST", "/api/physicians", data)).json(), onSuccess: () => { invalidatePhysicians(); setShowAdd(false); toast({ title: "Referring provider added" }); }, onError: onErr });
  const bulkStatusMutation = useMutation({ mutationFn: async ({ physicianIds, status }: { physicianIds: string[]; status: string }) => (await apiRequest("POST", "/api/physicians/bulk-status", { physicianIds, status })).json(), onSuccess: (data) => { invalidatePhysicians(); setSelectedIds(new Set()); toast({ title: `${data.count} referring provider(s) updated` }); }, onError: onErr });
  const bulkAssignMutation = useMutation({ mutationFn: async ({ physicianIds, marketerId }: { physicianIds: string[]; marketerId: string | null }) => (await apiRequest("POST", "/api/physicians/bulk-assign", { physicianIds, marketerId })).json(), onSuccess: (data) => { invalidatePhysicians(); setSelectedIds(new Set()); toast({ title: `${data.count} referring provider(s) reassigned` }); }, onError: onErr });
  const bulkDeleteMutation = useMutation({ mutationFn: async (ids: string[]) => (await apiRequest("POST", "/api/physicians/bulk-delete", { physicianIds: ids })).json(), onSuccess: (data) => { invalidatePhysicians(); queryClient.invalidateQueries({ queryKey: ["/api/physicians"] }); setSelectedIds(new Set()); setShowBulkDelete(false); toast({ title: `${data.count} referring provider(s) deleted` }); }, onError: onErr });
  const mergeMutation = useMutation({ mutationFn: async ({ keepId, removeId }: { keepId: string; removeId: string }) => (await apiRequest("POST", "/api/physicians/merge", { keepId, removeId })).json(), onSuccess: () => { invalidatePhysicians(); toast({ title: "Referring providers merged successfully" }); }, onError: (err: Error) => toast({ title: "Merge failed", description: err.message, variant: "destructive" }) });
  const enrichAllMutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/import/enrich-npis", {})).json(), onSuccess: (data: EnrichResult) => { setEnrichResult(data); setShowEnrichDialog(true); invalidatePhysicians(); }, onError: (err: Error) => toast({ title: "Enrichment failed", description: err.message, variant: "destructive" }) });
  const quickInteractionMutation = useMutation({ mutationFn: async (data: Record<string, unknown>) => (await apiRequest("POST", "/api/interactions", data)).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/interactions"] }); invalidatePhysicians(); setQuickAddPhysician(null); toast({ title: "Interaction logged" }); }, onError: onErr });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addMutation.mutate({ firstName: fd.get("firstName"), lastName: fd.get("lastName"), credentials: fd.get("credentials") || undefined, specialty: fd.get("specialty") || undefined, npi: fd.get("npi") || undefined, practiceName: fd.get("practiceName") || undefined, phone: fd.get("phone") || undefined, email: fd.get("email") || undefined, city: fd.get("city") || undefined, state: fd.get("state") || undefined, status: fd.get("status") || "PROSPECT", priority: fd.get("priority") || "MEDIUM", relationshipStage: fd.get("relationshipStage") || "NEW" });
  };

  const handleSort = (field: SortField) => { if (sortBy === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc"); else { setSortBy(field); setSortOrder("asc"); } setPage(1); };
  const clearFilters = () => { setStatusFilter("all"); setStageFilter("all"); setPriorityFilter("all"); setPracticeFilter(""); setSearch(""); setPage(1); };
  const setPageSafe = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => selectedIds.size === physicians.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(physicians.map(p => p.id)));

  const exportParams = new URLSearchParams();
  if (debouncedSearch) exportParams.set("search", debouncedSearch);
  if (statusFilter !== "all") exportParams.set("status", statusFilter);
  if (stageFilter !== "all") exportParams.set("stage", stageFilter);
  if (priorityFilter !== "all") exportParams.set("priority", priorityFilter);
  if (practiceFilter) exportParams.set("practiceName", practiceFilter);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="page-header">
        <div>
          <h1 data-testid="text-physicians-title">Referring Providers</h1>
          <p className="page-subtitle">{total} referring providers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/export/physicians?${exportParams.toString()}`, "_blank")} data-testid="button-export-physicians">
            <Download className="w-4 h-4 mr-1.5" />Export CSV
          </Button>
          {canBulkAction && (
            <>
              <Button variant="outline" size="sm" onClick={() => enrichAllMutation.mutate()} disabled={enrichAllMutation.isPending} data-testid="button-enrich-all-npis">
                {enrichAllMutation.isPending ? <span className="w-4 h-4 mr-1.5 animate-spin inline-block border-2 border-current border-t-transparent rounded-full" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                Enrich All NPIs
              </Button>
              <PhysiciansEnrichDialog open={showEnrichDialog} result={enrichResult} onClose={() => setShowEnrichDialog(false)} />
              <Button variant="outline" size="sm" onClick={() => setShowMerge(true)} data-testid="button-open-merge"><Merge className="w-4 h-4 mr-1.5" />Merge by NPI</Button>
              <PhysiciansMergeDialog open={showMerge} mergeNpi={mergeNpi} setMergeNpi={setMergeNpi} mergeMutation={mergeMutation} onClose={() => setShowMerge(false)} />
            </>
          )}
          {canCreate && <PhysiciansAddForm open={showAdd} isPending={addMutation.isPending} onOpenChange={setShowAdd} onSubmit={handleAdd} />}
        </div>
      </div>

      <PhysiciansFilters
        search={search} statusFilter={statusFilter} stageFilter={stageFilter}
        priorityFilter={priorityFilter} practiceFilter={practiceFilter}
        showFavoritesOnly={showFavoritesOnly} hasActiveFilters={hasActiveFilters}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        onStatusChange={(v) => { setStatusFilter(v); setPage(1); }}
        onStageChange={(v) => { setStageFilter(v); setPage(1); }}
        onPriorityChange={(v) => { setPriorityFilter(v); setPage(1); }}
        onClearPracticeFilter={() => { setPracticeFilter(""); setPage(1); }}
        onToggleFavorites={() => { setShowFavoritesOnly(!showFavoritesOnly); setPage(1); }}
        onClearFilters={clearFilters}
      />

      {selectedIds.size > 0 && canBulkAction && (
        <PhysiciansBulkActions
          selectedCount={selectedIds.size} users={users}
          isStatusPending={bulkStatusMutation.isPending} isAssignPending={bulkAssignMutation.isPending}
          isDeletePending={bulkDeleteMutation.isPending} showBulkDelete={showBulkDelete}
          onSetStatus={(status) => bulkStatusMutation.mutate({ physicianIds: Array.from(selectedIds), status })}
          onBulkAssign={(mId) => bulkAssignMutation.mutate({ physicianIds: Array.from(selectedIds), marketerId: mId === "unassign" ? null : mId })}
          onShowBulkDelete={setShowBulkDelete}
          onConfirmDelete={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      <PhysiciansTable
        physicians={physicians} users={users} favoriteIds={favoriteIds}
        isLoading={isLoading} isError={isError} canCreate={canCreate} canBulkAction={canBulkAction}
        hasActiveFilters={hasActiveFilters} selectedIds={selectedIds}
        sortBy={sortBy} sortOrder={sortOrder} page={page} totalPages={totalPages} total={total}
        isFavoritePending={toggleFavorite.isPending}
        onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
        onToggleFavorite={(id) => toggleFavorite.mutate(id)}
        onSetPractice={setSelectedPractice} onQuickInteraction={setQuickAddPhysician}
        onSort={handleSort} onRetry={() => refetch()} onClearFilters={clearFilters}
        onAddNew={() => setShowAdd(true)} onPageChange={setPageSafe}
      />

      <PhysiciansQuickInteractionDialog
        physician={quickAddPhysician} locations={locations}
        isPending={quickInteractionMutation.isPending}
        onClose={() => setQuickAddPhysician(null)}
        onSubmit={(data) => quickInteractionMutation.mutate(data)}
      />

      <PracticeDetailDialog
        practiceName={selectedPractice} onClose={() => setSelectedPractice(null)}
        onFilterByPractice={(name) => { setPracticeFilter(name); setPage(1); setSelectedPractice(null); }}
      />
    </div>
  );
}
