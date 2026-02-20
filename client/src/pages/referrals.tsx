import { useState, useEffect, useCallback, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, FileText, Download, X, ChevronLeft, ChevronRight, UserPlus, Check, Trash2, Pencil, Save, Loader2 } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Physician, Location } from "@shared/schema";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  RECEIVED: "bg-chart-1/15 text-chart-1",
  SCHEDULED: "bg-chart-3/15 text-chart-3",
  EVAL_COMPLETED: "bg-chart-2/15 text-chart-2",
  DISCHARGED: "bg-chart-4/15 text-chart-4",
  LOST: "bg-chart-5/15 text-chart-5",
};

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const debouncedSearch = useDebounce(search, 300);

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (locationFilter !== "all") params.set("locationId", locationFilter);
    if (disciplineFilter !== "all") params.set("discipline", disciplineFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [page, debouncedSearch, statusFilter, locationFilter, disciplineFilter, dateFrom, dateTo]);

  const queryParams = buildQueryParams();
  const { data: result, isLoading } = useQuery<any>({
    queryKey: ["/api/referrals/paginated", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/referrals/paginated?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  const canCreate = user ? hasPermission(user.role, "create", "referral") : false;
  const isOwner = user?.role === "OWNER";
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === referrals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(referrals.map((r: any) => r.id)));
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/referrals/bulk", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return key === "/api/referrals/paginated" || key === "/api/referrals" || key === "/api/physicians";
      }});
      setSelectedIds(new Set());
      toast({ title: `${data.count} referral${data.count === 1 ? "" : "s"} deleted` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const [physicianSearch, setPhysicianSearch] = useState("");
  const [physicianResults, setPhysicianResults] = useState<any[]>([]);
  const [selectedPhysician, setSelectedPhysician] = useState<any>(null);
  const [showPhysicianDropdown, setShowPhysicianDropdown] = useState(false);
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [newProviderData, setNewProviderData] = useState({ firstName: "", lastName: "", credentials: "", npi: "", practiceName: "", specialty: "" });
  const physicianSearchRef = useRef<HTMLDivElement>(null);
  const debouncedPhysicianSearch = useDebounce(physicianSearch, 300);

  useEffect(() => {
    if (debouncedPhysicianSearch.length >= 2) {
      fetch(`/api/physicians/search?q=${encodeURIComponent(debouncedPhysicianSearch)}`, { credentials: "include" })
        .then(r => r.json())
        .then(data => { setPhysicianResults(data); setShowPhysicianDropdown(true); })
        .catch(() => setPhysicianResults([]));
    } else {
      setPhysicianResults([]);
      setShowPhysicianDropdown(false);
    }
  }, [debouncedPhysicianSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (physicianSearchRef.current && !physicianSearchRef.current.contains(e.target as Node)) {
        setShowPhysicianDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const resetAddForm = () => {
    setPhysicianSearch("");
    setSelectedPhysician(null);
    setShowNewProvider(false);
    setNewProviderData({ firstName: "", lastName: "", credentials: "", npi: "", practiceName: "", specialty: "" });
    setPhysicianResults([]);
    setShowPhysicianDropdown(false);
  };

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/referrals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/paginated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setShowAdd(false);
      resetAddForm();
      toast({ title: "Referral added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/referrals/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/paginated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setIsEditing(false);
      setSelectedReferral(null);
      toast({ title: "Referral updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const startEditing = (r: any) => {
    setEditData({
      patientFullName: r.patientFullName || "",
      patientPhone: r.patientPhone || "",
      patientDob: r.patientDob || "",
      patientAccountNumber: r.patientAccountNumber || "",
      referralDate: r.referralDate || "",
      status: r.status || "RECEIVED",
      diagnosisCategory: r.diagnosisCategory || "",
      referralSource: r.referralSource || "",
      discipline: r.discipline || "",
      caseTitle: r.caseTitle || "",
      caseTherapist: r.caseTherapist || "",
      primaryInsurance: r.primaryInsurance || "",
      primaryPayerType: r.primaryPayerType || "",
      locationId: r.locationId || "",
      referringProviderName: r.referringProviderName || (r.physicianFirstName ? `${r.physicianFirstName} ${r.physicianLastName}` : ""),
      referringProviderNpi: r.referringProviderNpi || "",
      dateOfInitialEval: r.dateOfInitialEval || "",
      dischargeDate: r.dischargeDate || "",
      dischargeReason: r.dischargeReason || "",
      scheduledVisits: r.scheduledVisits || 0,
      arrivedVisits: r.arrivedVisits || 0,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!selectedReferral) return;
    updateMutation.mutate({ id: selectedReferral.id, data: editData });
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const patientName = (fd.get("patientFullName") as string || "").trim();
    const nameParts = patientName.split(" ");
    const initials = nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : patientName.slice(0, 2).toUpperCase();

    const payload: any = {
      locationId: fd.get("locationId"),
      referralDate: fd.get("referralDate"),
      patientInitialsOrAnonId: initials || "XX",
      patientFullName: patientName || null,
      patientPhone: (fd.get("patientPhone") as string || "").trim() || null,
      patientDob: (fd.get("patientDob") as string || "").trim() || null,
      status: fd.get("status") || "RECEIVED",
      diagnosisCategory: (fd.get("diagnosisCategory") as string || "").trim() || null,
      referralSource: fd.get("referralSource") || null,
      discipline: fd.get("discipline") || null,
    };

    if (selectedPhysician) {
      payload.physicianId = selectedPhysician.id;
      payload.referringProviderName = `${selectedPhysician.firstName} ${selectedPhysician.lastName}`;
      payload.referringProviderNpi = selectedPhysician.npi || null;
    } else if (showNewProvider && newProviderData.firstName && newProviderData.lastName) {
      payload.newPhysician = { ...newProviderData };
    }

    addMutation.mutate(payload);
  };

  const hasActiveFilters = statusFilter !== "all" || locationFilter !== "all" || disciplineFilter !== "all" || dateFrom !== "" || dateTo !== "" || search !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setLocationFilter("all");
    setDisciplineFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  };

  const referrals = result?.data || [];
  const total = result?.total || 0;
  const totalPages = result?.totalPages || 1;
  const activeCount = result?.activeCount || 0;
  const dischargedCount = result?.dischargedCount || 0;

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (locationFilter !== "all") params.set("locationId", locationFilter);
    if (disciplineFilter !== "all") params.set("discipline", disciplineFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const res = await fetch(`/api/export/referrals?${params.toString()}`, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referrals-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setPageAndReset = (p: number) => { setPage(Math.max(1, Math.min(p, totalPages))); setSelectedIds(new Set()); };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-referrals-title">Referrals</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{total} total cases &middot; {activeCount} active &middot; {dischargedCount} discharged</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && selectedIds.size > 0 && (
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-bulk-delete-referrals">
                  <Trash2 className="w-3 h-3 mr-1.5" />Delete {selectedIds.size} Selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} Referral{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the selected referral records. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete"
                  >
                    {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-referrals">
            <Download className="w-3 h-3 mr-1.5" />Export CSV
          </Button>
          {canCreate && (
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-referral"><Plus className="w-4 h-4 mr-2" />New Referral</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Referral</DialogTitle>
                  <DialogDescription>Record a new patient referral</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Referring Doctor</Label>
                    {selectedPhysician ? (
                      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                        <Check className="w-4 h-4 text-chart-2 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" data-testid="text-selected-physician">
                            {selectedPhysician.lastName}, {selectedPhysician.firstName}{selectedPhysician.credentials ? `, ${selectedPhysician.credentials}` : ""}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {[selectedPhysician.practiceName, selectedPhysician.npi ? `NPI: ${selectedPhysician.npi}` : null].filter(Boolean).join(" \u00b7 ") || "No practice info"}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => { setSelectedPhysician(null); setPhysicianSearch(""); }} data-testid="button-clear-physician">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : showNewProvider ? (
                      <div className="space-y-3 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">New Provider</p>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewProvider(false)} data-testid="button-cancel-new-provider">
                            <X className="w-3 h-3 mr-1" />Cancel
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">First Name *</Label>
                            <Input value={newProviderData.firstName} onChange={(e) => setNewProviderData(p => ({ ...p, firstName: e.target.value }))} placeholder="First" data-testid="input-new-provider-first" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Last Name *</Label>
                            <Input value={newProviderData.lastName} onChange={(e) => setNewProviderData(p => ({ ...p, lastName: e.target.value }))} placeholder="Last" data-testid="input-new-provider-last" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Credentials</Label>
                            <Input value={newProviderData.credentials} onChange={(e) => setNewProviderData(p => ({ ...p, credentials: e.target.value }))} placeholder="e.g. M.D." data-testid="input-new-provider-credentials" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">NPI</Label>
                            <Input value={newProviderData.npi} onChange={(e) => setNewProviderData(p => ({ ...p, npi: e.target.value }))} placeholder="NPI #" data-testid="input-new-provider-npi" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Practice Name</Label>
                            <Input value={newProviderData.practiceName} onChange={(e) => setNewProviderData(p => ({ ...p, practiceName: e.target.value }))} placeholder="Practice" data-testid="input-new-provider-practice" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Specialty</Label>
                            <Input value={newProviderData.specialty} onChange={(e) => setNewProviderData(p => ({ ...p, specialty: e.target.value }))} placeholder="Specialty" data-testid="input-new-provider-specialty" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div ref={physicianSearchRef} className="relative">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            value={physicianSearch}
                            onChange={(e) => setPhysicianSearch(e.target.value)}
                            onFocus={() => { if (physicianResults.length > 0) setShowPhysicianDropdown(true); }}
                            placeholder="Search by name, NPI, or practice..."
                            className="pl-9"
                            data-testid="input-physician-search"
                          />
                        </div>
                        {showPhysicianDropdown && (
                          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                            {physicianResults.length > 0 ? physicianResults.map((p: any) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                                onClick={() => { setSelectedPhysician(p); setPhysicianSearch(""); setShowPhysicianDropdown(false); }}
                                data-testid={`option-physician-${p.id}`}
                              >
                                <p className="font-medium">{p.lastName}, {p.firstName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                                <p className="text-[10px] text-muted-foreground">{[p.specialty, p.practiceName, p.npi ? `NPI: ${p.npi}` : null].filter(Boolean).join(" \u00b7 ")}</p>
                              </button>
                            )) : (
                              <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                                No referring providers found
                              </div>
                            )}
                          </div>
                        )}
                        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setShowNewProvider(true)} data-testid="button-add-new-provider">
                          <UserPlus className="w-3.5 h-3.5 mr-1.5" />Add New Provider
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Facility *</Label>
                    <select name="locationId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-referral-location">
                      <option value="">Select facility...</option>
                      {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Created Date *</Label>
                    <Input name="referralDate" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required data-testid="input-referral-date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Patient Name *</Label>
                    <Input name="patientFullName" placeholder="e.g. JOHN DOE" required data-testid="input-referral-patient-name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Phone Number</Label>
                      <Input name="patientPhone" type="tel" placeholder="(555) 555-1234" data-testid="input-referral-patient-phone" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date of Birth</Label>
                      <Input name="patientDob" type="date" data-testid="input-referral-patient-dob" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Discipline</Label>
                      <select name="discipline" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-discipline-input">
                        <option value="PT">PT</option>
                        <option value="OT">OT</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Referral Source</Label>
                      <select name="referralSource" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-source">
                        <option value="">-</option>
                        <option value="Doctors Office">Doctor's Office</option>
                        <option value="Former Patient">Former Patient</option>
                        <option value="Direct Access">Direct Access</option>
                        <option value="Walk-in">Walk-in</option>
                        <option value="Google">Google</option>
                        <option value="Insurance">Insurance</option>
                        <option value="Friend">Friend</option>
                        <option value="Employee">Employee</option>
                        <option value="Other/Option not in list">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <select name="status" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-status-input">
                        <option value="RECEIVED">Received</option>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="EVAL_COMPLETED">Eval Completed</option>
                        <option value="DISCHARGED">Discharged</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Diagnosis</Label>
                      <Input name="diagnosisCategory" placeholder="e.g. Post-Op" data-testid="input-referral-diagnosis" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => { setShowAdd(false); resetAddForm(); }}>Cancel</Button>
                    <Button type="submit" disabled={addMutation.isPending} data-testid="button-submit-referral">
                      {addMutation.isPending ? "Adding..." : "Add Referral"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search patient, doctor, therapist..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" data-testid="input-search-referrals" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]" data-testid="select-filter-referral-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="RECEIVED">Received</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="EVAL_COMPLETED">Eval Completed</SelectItem>
            <SelectItem value="DISCHARGED">Discharged</SelectItem>
            <SelectItem value="LOST">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={(v) => { setLocationFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-referral-location">
            <SelectValue placeholder="Facility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Facilities</SelectItem>
            {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={disciplineFilter} onValueChange={(v) => { setDisciplineFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px]" data-testid="select-filter-referral-discipline">
            <SelectValue placeholder="Discipline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="PT">PT</SelectItem>
            <SelectItem value="OT">OT</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[140px]" data-testid="input-filter-referral-date-from" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[140px]" data-testid="input-filter-referral-date-to" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-referral-filters">
            <X className="w-3 h-3 mr-1" />Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : referrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No referrals found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isOwner && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={referrals.length > 0 && selectedIds.size === referrals.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Created</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Referring Doctor</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Disc.</TableHead>
                    <TableHead className="hidden md:table-cell">Diagnosis</TableHead>
                    <TableHead className="hidden lg:table-cell">Therapist</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Visits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((r: any) => (
                    <TableRow key={r.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedReferral(r)} data-testid={`row-referral-${r.id}`}>
                      {isOwner && (
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={`Select referral ${r.patientFullName || r.id}`}
                            data-testid={`checkbox-referral-${r.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.referralDate + "T00:00:00"), "MM/dd/yy")}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium" data-testid={`text-patient-name-${r.id}`}>{r.patientFullName || r.patientInitialsOrAnonId || "-"}</p>
                          {r.patientAccountNumber && <p className="text-[10px] text-muted-foreground">{r.patientAccountNumber}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.physicianFirstName ? `${r.physicianFirstName} ${r.physicianLastName}` : "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.locationName?.replace("Tristar PT - ", "") || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusBadge[r.status]}`}>
                          {r.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {r.discipline && <Badge variant="outline" className="text-[10px]">{r.discipline}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[180px] truncate">{r.diagnosisCategory || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{r.caseTherapist || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell text-right">
                        {r.arrivedVisits || 0}/{r.scheduledVisits || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" data-testid="text-referral-count">{total} referrals</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPageAndReset(page - 1)} data-testid="button-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="text-page-info">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPageAndReset(page + 1)} data-testid="button-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!selectedReferral} onOpenChange={(open) => { if (!open) { setSelectedReferral(null); setIsEditing(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle data-testid="text-detail-title">{isEditing ? "Edit Referral" : "Case Details"}</DialogTitle>
                <DialogDescription>{selectedReferral?.patientAccountNumber || "Referral"}</DialogDescription>
              </div>
              {selectedReferral && !isEditing && (
                <Button variant="outline" size="sm" onClick={() => startEditing(selectedReferral)} data-testid="button-edit-referral">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedReferral && !isEditing && (() => {
            const r = selectedReferral;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient</p>
                    <p className="font-medium" data-testid="detail-patient-name">{r.patientFullName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Account #</p>
                    <p className="font-mono">{r.patientAccountNumber || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created Date</p>
                    <p>{format(new Date(r.referralDate + "T00:00:00"), "MM/dd/yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline" className={`text-[10px] ${statusBadge[r.status]}`}>{r.status.replace("_", " ")}</Badge>
                  </div>
                </div>
                <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Referring Doctor</p>
                    <p>{r.physicianFirstName ? `${r.physicianFirstName} ${r.physicianLastName}${r.physicianCredentials ? `, ${r.physicianCredentials}` : ""}` : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Referral Source</p>
                    <p>{r.referralSource || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Facility</p>
                    <p>{r.locationName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Discipline</p>
                    <p>{r.discipline || "-"}</p>
                  </div>
                </div>
                <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Case Title</p>
                    <p>{r.caseTitle || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Therapist</p>
                    <p>{r.caseTherapist || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Diagnosis</p>
                    <p>{r.diagnosisCategory || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Initial Eval</p>
                    <p>{r.dateOfInitialEval ? format(new Date(r.dateOfInitialEval + "T00:00:00"), "MM/dd/yyyy") : "-"}</p>
                  </div>
                </div>
                <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Scheduled Visits</p>
                    <p>{r.scheduledVisits || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Arrived Visits</p>
                    <p>{r.arrivedVisits || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">First Scheduled</p>
                    <p>{r.dateOfFirstScheduledVisit ? format(new Date(r.dateOfFirstScheduledVisit + "T00:00:00"), "MM/dd/yyyy") : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">First Arrived</p>
                    <p>{r.dateOfFirstArrivedVisit ? format(new Date(r.dateOfFirstArrivedVisit + "T00:00:00"), "MM/dd/yyyy") : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created to Arrived</p>
                    <p>{r.createdToArrived != null ? `${r.createdToArrived} days` : "-"}</p>
                  </div>
                </div>
                <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Insurance</p>
                    <p>{r.primaryInsurance || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payer Type</p>
                    <p>{r.primaryPayerType || "-"}</p>
                  </div>
                </div>
                {r.dischargeDate && (
                  <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Discharge Date</p>
                      <p>{format(new Date(r.dischargeDate + "T00:00:00"), "MM/dd/yyyy")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Discharge Reason</p>
                      <p>{r.dischargeReason || "-"}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {selectedReferral && isEditing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Patient Full Name</Label>
                  <Input value={editData.patientFullName} onChange={(e) => setEditData({ ...editData, patientFullName: e.target.value })} data-testid="edit-patient-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Patient Phone</Label>
                  <Input value={editData.patientPhone} onChange={(e) => setEditData({ ...editData, patientPhone: e.target.value })} data-testid="edit-patient-phone" />
                </div>
                <div className="space-y-1.5">
                  <Label>Patient DOB</Label>
                  <Input type="date" value={editData.patientDob} onChange={(e) => setEditData({ ...editData, patientDob: e.target.value })} data-testid="edit-patient-dob" />
                </div>
                <div className="space-y-1.5">
                  <Label>Account #</Label>
                  <Input value={editData.patientAccountNumber} onChange={(e) => setEditData({ ...editData, patientAccountNumber: e.target.value })} data-testid="edit-account-number" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Referral Date</Label>
                  <Input type="date" value={editData.referralDate} onChange={(e) => setEditData({ ...editData, referralDate: e.target.value })} data-testid="edit-referral-date" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editData.status} onChange={(e) => setEditData({ ...editData, status: e.target.value })} data-testid="edit-status">
                    <option value="RECEIVED">Received</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="EVAL_COMPLETED">Eval Completed</option>
                    <option value="DISCHARGED">Discharged</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Referring Provider Name</Label>
                  <Input value={editData.referringProviderName} onChange={(e) => setEditData({ ...editData, referringProviderName: e.target.value })} data-testid="edit-referring-provider" />
                </div>
                <div className="space-y-1.5">
                  <Label>Referring Provider NPI</Label>
                  <Input value={editData.referringProviderNpi} onChange={(e) => setEditData({ ...editData, referringProviderNpi: e.target.value })} data-testid="edit-referring-npi" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Facility</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editData.locationId} onChange={(e) => setEditData({ ...editData, locationId: e.target.value })} data-testid="edit-location">
                    <option value="">-</option>
                    {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Discipline</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editData.discipline} onChange={(e) => setEditData({ ...editData, discipline: e.target.value })} data-testid="edit-discipline">
                    <option value="">-</option>
                    <option value="PT">PT</option>
                    <option value="OT">OT</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Referral Source</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={editData.referralSource} onChange={(e) => setEditData({ ...editData, referralSource: e.target.value })} data-testid="edit-referral-source">
                    <option value="">-</option>
                    <option value="Doctors Office">Doctor's Office</option>
                    <option value="Former Patient">Former Patient</option>
                    <option value="Direct Access">Direct Access</option>
                    <option value="Walk-in">Walk-in</option>
                    <option value="Google">Google</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Friend">Friend</option>
                    <option value="Employee">Employee</option>
                    <option value="GoHighLevel">GoHighLevel</option>
                    <option value="Other/Option not in list">Other</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Diagnosis</Label>
                  <Input value={editData.diagnosisCategory} onChange={(e) => setEditData({ ...editData, diagnosisCategory: e.target.value })} data-testid="edit-diagnosis" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Case Title</Label>
                  <Input value={editData.caseTitle} onChange={(e) => setEditData({ ...editData, caseTitle: e.target.value })} data-testid="edit-case-title" />
                </div>
                <div className="space-y-1.5">
                  <Label>Therapist</Label>
                  <Input value={editData.caseTherapist} onChange={(e) => setEditData({ ...editData, caseTherapist: e.target.value })} data-testid="edit-therapist" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Insurance</Label>
                  <Input value={editData.primaryInsurance} onChange={(e) => setEditData({ ...editData, primaryInsurance: e.target.value })} data-testid="edit-insurance" />
                </div>
                <div className="space-y-1.5">
                  <Label>Payer Type</Label>
                  <Input value={editData.primaryPayerType} onChange={(e) => setEditData({ ...editData, primaryPayerType: e.target.value })} data-testid="edit-payer-type" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Initial Eval Date</Label>
                  <Input type="date" value={editData.dateOfInitialEval} onChange={(e) => setEditData({ ...editData, dateOfInitialEval: e.target.value })} data-testid="edit-initial-eval" />
                </div>
                <div className="space-y-1.5">
                  <Label>Scheduled Visits</Label>
                  <Input type="number" value={editData.scheduledVisits} onChange={(e) => setEditData({ ...editData, scheduledVisits: parseInt(e.target.value) || 0 })} data-testid="edit-scheduled-visits" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Arrived Visits</Label>
                  <Input type="number" value={editData.arrivedVisits} onChange={(e) => setEditData({ ...editData, arrivedVisits: parseInt(e.target.value) || 0 })} data-testid="edit-arrived-visits" />
                </div>
                <div className="space-y-1.5">
                  <Label>Discharge Date</Label>
                  <Input type="date" value={editData.dischargeDate} onChange={(e) => setEditData({ ...editData, dischargeDate: e.target.value })} data-testid="edit-discharge-date" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Discharge Reason</Label>
                <Input value={editData.dischargeReason} onChange={(e) => setEditData({ ...editData, dischargeReason: e.target.value })} data-testid="edit-discharge-reason" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">Cancel</Button>
                <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit">
                  {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
