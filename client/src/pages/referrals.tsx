import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import type { Physician, Location, Referral } from "@shared/schema";
import { format, parse, endOfMonth } from "date-fns";
import { ReferralsFilters } from "./referrals-filters";
import { ReferralsTable } from "./referrals-table";
import { ReferralsDetailDialog } from "./referrals-detail-dialog";
import { ReferralsEditForm } from "./referrals-edit-form";
import { ReferralsAddForm } from "./referrals-add-form";
import { ReferralsBulkActions } from "./referrals-bulk-actions";

type ReferralRow = Referral & { physicianFirstName?: string; physicianLastName?: string; physicianCredentials?: string; locationName?: string };
type EditData = Record<string, string | number>;

const invalidateReferrals = () => queryClient.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return k === "/api/referrals/paginated" || k === "/api/referrals" || k === "/api/physicians"; } });

export default function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const monthParam = urlParams.get("month");

  const parseMonth = (dir: "start" | "end") => { if (!monthParam) return ""; try { const d = parse(monthParam, "yyyy-MM", new Date()); if (isNaN(d.getTime())) return ""; return format(dir === "end" ? endOfMonth(d) : d, "yyyy-MM-dd"); } catch { return ""; } };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "all");
  const [locationFilter, setLocationFilter] = useState(urlParams.get("locationId") || "all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(parseMonth("start"));
  const [dateTo, setDateTo] = useState(parseMonth("end"));
  const [showAdd, setShowAdd] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<ReferralRow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<EditData>({});
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
  const [showRestoreAllConfirm, setShowRestoreAllConfirm] = useState(false);
  const pageSize = 50;

  const [editPhysicianSearch, setEditPhysicianSearch] = useState("");
  const [editPhysicianResults, setEditPhysicianResults] = useState<Physician[]>([]);
  const [showEditPhysicianDropdown, setShowEditPhysicianDropdown] = useState(false);
  const editPhysicianSearchRef = useRef<HTMLDivElement>(null);
  const debouncedEditPhysicianSearch = useDebounce(editPhysicianSearch, 300);
  const debouncedSearch = useDebounce(search, 300);

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  const buildQueryParams = useCallback(() => { const p = new URLSearchParams(); p.set("page", String(page)); p.set("pageSize", String(pageSize)); if (debouncedSearch) p.set("search", debouncedSearch); if (statusFilter !== "all") p.set("status", statusFilter); if (locationFilter !== "all") p.set("locationId", locationFilter); if (disciplineFilter !== "all") p.set("discipline", disciplineFilter); if (dateFrom) p.set("dateFrom", dateFrom); if (dateTo) p.set("dateTo", dateTo); if (sortBy) { p.set("sortBy", sortBy); p.set("sortDir", sortDir); } return p.toString(); }, [page, debouncedSearch, statusFilter, locationFilter, disciplineFilter, dateFrom, dateTo, sortBy, sortDir]);

  const queryParams = buildQueryParams();
  const { data: result, isLoading, isError, refetch } = useQuery<{ data: ReferralRow[]; total: number; totalPages: number; activeCount?: number; dischargedCount?: number }>({
    queryKey: ["/api/referrals/paginated", queryParams],
    queryFn: async () => { const res = await fetch(`/api/referrals/paginated?${queryParams}`, { credentials: "include" }); if (!res.ok) throw new Error("Failed to fetch"); return res.json(); },
  });

  useEffect(() => { if (debouncedEditPhysicianSearch.length >= 2) { apiRequest("GET", `/api/physicians/search?q=${encodeURIComponent(debouncedEditPhysicianSearch)}`).then(r => r.json()).then((data: Physician[]) => { setEditPhysicianResults(data); setShowEditPhysicianDropdown(true); }).catch(() => setEditPhysicianResults([])); } else { setEditPhysicianResults([]); setShowEditPhysicianDropdown(false); } }, [debouncedEditPhysicianSearch]);
  useEffect(() => { const h = (e: MouseEvent) => { if (editPhysicianSearchRef.current && !editPhysicianSearchRef.current.contains(e.target as Node)) setShowEditPhysicianDropdown(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  const canCreate = user ? hasPermission(user.role, "create", "referral") : false;
  const isOwner = user?.role === "OWNER";

  const onErr = (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" });
  const addMutation = useMutation({ mutationFn: async (data: Record<string, unknown>) => (await apiRequest("POST", "/api/referrals", data)).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referrals/paginated"] }); queryClient.invalidateQueries({ queryKey: ["/api/physicians"] }); setShowAdd(false); toast({ title: "Referral added" }); }, onError: onErr });
  const updateMutation = useMutation({ mutationFn: async ({ id, data }: { id: string; data: EditData }) => (await apiRequest("PATCH", `/api/referrals/${id}`, data)).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/referrals/paginated"] }); queryClient.invalidateQueries({ queryKey: ["/api/physicians"] }); setIsEditing(false); setSelectedReferral(null); toast({ title: "Referral updated" }); }, onError: onErr });
  const bulkDeleteMutation = useMutation({ mutationFn: async (ids: string[]) => (await apiRequest("DELETE", "/api/referrals/bulk", { ids })).json(), onSuccess: (data) => { invalidateReferrals(); setSelectedIds(new Set()); toast({ title: `${data.count} referral${data.count === 1 ? "" : "s"} deleted` }); }, onError: onErr });
  const deleteAllMutation = useMutation({ mutationFn: async () => (await apiRequest("DELETE", "/api/referrals/all")).json(), onSuccess: (data) => { invalidateReferrals(); setShowDeleteAllConfirm(false); setDeleteAllConfirmText(""); toast({ title: `All ${data.count} referrals deleted`, description: "You can restore them using the Restore All button." }); }, onError: onErr });
  const restoreAllMutation = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/referrals/restore-all")).json(), onSuccess: (data) => { invalidateReferrals(); setShowRestoreAllConfirm(false); toast({ title: `${data.count} referrals restored` }); }, onError: onErr });

  const startEditing = (r: ReferralRow) => { setEditPhysicianSearch(""); setEditPhysicianResults([]); setShowEditPhysicianDropdown(false); setEditData({ patientFullName: r.patientFullName || "", patientPhone: r.patientPhone || "", patientDob: r.patientDob || "", patientAccountNumber: r.patientAccountNumber || "", referralDate: r.referralDate || "", status: r.status || "RECEIVED", diagnosisCategory: r.diagnosisCategory || "", referralSource: r.referralSource || "", discipline: r.discipline || "", caseTitle: r.caseTitle || "", caseTherapist: r.caseTherapist || "", primaryInsurance: r.primaryInsurance || "", primaryPayerType: r.primaryPayerType || "", locationId: r.locationId || "", referringProviderName: r.referringProviderName || (r.physicianFirstName ? `${r.physicianFirstName} ${r.physicianLastName}` : ""), referringProviderNpi: r.referringProviderNpi || "", physicianId: r.physicianId || "", dateOfInitialEval: r.dateOfInitialEval || "", dischargeDate: r.dischargeDate || "", dischargeReason: r.dischargeReason || "", scheduledVisits: r.scheduledVisits || 0, arrivedVisits: r.arrivedVisits || 0 }); setIsEditing(true); };

  const hasActiveFilters = statusFilter !== "all" || locationFilter !== "all" || disciplineFilter !== "all" || dateFrom !== "" || dateTo !== "" || search !== "";
  const clearFilters = () => { setStatusFilter("all"); setLocationFilter("all"); setDisciplineFilter("all"); setDateFrom(""); setDateTo(""); setSearch(""); setPage(1); };
  const referrals = result?.data || [];
  const total = result?.total || 0;
  const totalPages = result?.totalPages || 1;

  const handleExport = async () => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (locationFilter !== "all") p.set("locationId", locationFilter);
    if (disciplineFilter !== "all") p.set("discipline", disciplineFilter);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    const res = await apiRequest("GET", `/api/export/referrals?${p.toString()}`);
    if (!res.ok) return;
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `referrals-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => selectedIds.size === referrals.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(referrals.map(r => r.id)));
  const toggleSort = (col: string) => { if (sortBy === col) { if (sortDir === "desc") setSortDir("asc"); else { setSortBy(""); setSortDir("desc"); } } else { setSortBy(col); setSortDir("desc"); } setPage(1); };
  const setPageAndReset = (p: number) => { setPage(Math.max(1, Math.min(p, totalPages))); setSelectedIds(new Set()); };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="page-header">
        <div>
          <h1 data-testid="text-referrals-title">Patients</h1>
          <p className="page-subtitle">{total} total cases &middot; {result?.activeCount || 0} active &middot; {result?.dischargedCount || 0} discharged</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && (
            <ReferralsBulkActions
              selectedCount={selectedIds.size}
              showDeleteConfirm={showDeleteConfirm} showRestoreAllConfirm={showRestoreAllConfirm}
              showDeleteAllConfirm={showDeleteAllConfirm} deleteAllConfirmText={deleteAllConfirmText}
              isBulkDeletePending={bulkDeleteMutation.isPending} isDeleteAllPending={deleteAllMutation.isPending}
              isRestoreAllPending={restoreAllMutation.isPending}
              onShowDeleteConfirm={setShowDeleteConfirm} onShowRestoreAllConfirm={setShowRestoreAllConfirm}
              onShowDeleteAllConfirm={setShowDeleteAllConfirm} onDeleteAllConfirmTextChange={setDeleteAllConfirmText}
              onBulkDelete={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              onDeleteAll={() => deleteAllMutation.mutate()}
              onRestoreAll={() => restoreAllMutation.mutate()}
            />
          )}
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-referrals">
            <Download className="w-3 h-3 mr-1.5" />Export CSV
          </Button>
          {canCreate && (
            <ReferralsAddForm open={showAdd} locations={locations} isPending={addMutation.isPending}
              onOpenChange={setShowAdd} onSubmit={(payload) => addMutation.mutate(payload)}
            />
          )}
        </div>
      </div>

      <ReferralsFilters
        search={search} statusFilter={statusFilter} locationFilter={locationFilter}
        disciplineFilter={disciplineFilter} dateFrom={dateFrom} dateTo={dateTo}
        locations={locations} hasActiveFilters={hasActiveFilters}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        onStatusChange={(v) => { setStatusFilter(v); setPage(1); }}
        onLocationChange={(v) => { setLocationFilter(v); setPage(1); }}
        onDisciplineChange={(v) => { setDisciplineFilter(v); setPage(1); }}
        onDateFromChange={(v) => { setDateFrom(v); setPage(1); }}
        onDateToChange={(v) => { setDateTo(v); setPage(1); }}
        onClearFilters={clearFilters}
      />

      <ReferralsTable
        referrals={referrals} isLoading={isLoading} isError={isError}
        isOwner={isOwner} canCreate={canCreate} hasActiveFilters={hasActiveFilters}
        selectedIds={selectedIds} sortBy={sortBy} sortDir={sortDir}
        page={page} totalPages={totalPages} total={total}
        onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
        onRowClick={setSelectedReferral} onToggleSort={toggleSort}
        onRetry={() => refetch()} onClearFilters={clearFilters}
        onAddNew={() => setShowAdd(true)} onPageChange={setPageAndReset}
      />

      <ReferralsDetailDialog
        referral={selectedReferral}
        onClose={() => { setSelectedReferral(null); setIsEditing(false); }}
        onEdit={startEditing}
        editContent={isEditing ? (
          <ReferralsEditForm
            editData={editData} locations={locations} isPending={updateMutation.isPending}
            editPhysicianSearch={editPhysicianSearch} editPhysicianResults={editPhysicianResults}
            showEditPhysicianDropdown={showEditPhysicianDropdown} editPhysicianSearchRef={editPhysicianSearchRef}
            onEditDataChange={setEditData} onEditPhysicianSearchChange={setEditPhysicianSearch}
            onEditPhysicianFocus={() => { if (editPhysicianResults.length > 0) setShowEditPhysicianDropdown(true); }}
            onSelectEditPhysician={(p) => { setEditData({ ...editData, referringProviderName: `${p.firstName} ${p.lastName}${p.credentials ? `, ${p.credentials}` : ""}`, referringProviderNpi: p.npi || "", physicianId: p.id }); setEditPhysicianSearch(""); setShowEditPhysicianDropdown(false); }}
            onClearEditProvider={() => setEditData({ ...editData, referringProviderName: "", referringProviderNpi: "", physicianId: "" })}
            onSave={() => { if (selectedReferral) updateMutation.mutate({ id: selectedReferral.id, data: editData }); }}
            onCancel={() => setIsEditing(false)}
          />
        ) : undefined}
      />
    </div>
  );
}
