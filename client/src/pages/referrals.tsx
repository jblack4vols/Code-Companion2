import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, FileText, Download, X } from "lucide-react";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Referral, Physician, Location } from "@shared/schema";
import { format, isAfter, isBefore, startOfDay, endOfDay, parseISO } from "date-fns";

const statusBadge: Record<string, string> = {
  RECEIVED: "bg-chart-1/15 text-chart-1",
  SCHEDULED: "bg-chart-3/15 text-chart-3",
  EVAL_COMPLETED: "bg-chart-2/15 text-chart-2",
  DISCHARGED: "bg-chart-4/15 text-chart-4",
  LOST: "bg-chart-5/15 text-chart-5",
};

export default function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: referrals, isLoading } = useQuery<Referral[]>({ queryKey: ["/api/referrals"] });
  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  const canCreate = user ? hasPermission(user.role, "create", "referral") : false;

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/referrals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referrals"] });
      setShowAdd(false);
      toast({ title: "Referral added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addMutation.mutate({
      physicianId: fd.get("physicianId"),
      locationId: fd.get("locationId"),
      referralDate: fd.get("referralDate"),
      patientInitialsOrAnonId: fd.get("patientInitialsOrAnonId"),
      patientFullName: fd.get("patientFullName") || null,
      patientDob: fd.get("patientDob") || null,
      patientPhone: fd.get("patientPhone") || null,
      status: fd.get("status") || "RECEIVED",
      payerType: fd.get("payerType") || null,
      diagnosisCategory: fd.get("diagnosisCategory") || null,
    });
  };

  const hasActiveFilters = statusFilter !== "all" || locationFilter !== "all" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setLocationFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  const filtered = referrals?.filter(r => {
    const phys = physicians?.find(p => p.id === r.physicianId);
    const matchSearch = search === "" ||
      r.patientInitialsOrAnonId.toLowerCase().includes(search.toLowerCase()) ||
      (r.patientFullName && r.patientFullName.toLowerCase().includes(search.toLowerCase())) ||
      (phys && `${phys.firstName} ${phys.lastName}`.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchLocation = locationFilter === "all" || r.locationId === locationFilter;
    const refDate = r.referralDate ? startOfDay(parseISO(r.referralDate)) : null;
    const matchDateFrom = !dateFrom || (refDate && !isBefore(refDate, startOfDay(parseISO(dateFrom))));
    const matchDateTo = !dateTo || (refDate && !isAfter(refDate, endOfDay(parseISO(dateTo))));
    return matchSearch && matchStatus && matchLocation && matchDateFrom && matchDateTo;
  })?.sort((a, b) => new Date(b.referralDate).getTime() - new Date(a.referralDate).getTime()) || [];

  const handleExport = () => {
    const csvRows = [
      ["Date", "Patient ID", "Patient Name", "DOB", "Phone", "Physician", "Location", "Status", "Payer", "Diagnosis"].join(","),
      ...filtered.map(r => {
        const phys = physicians?.find(p => p.id === r.physicianId);
        const loc = locations?.find(l => l.id === r.locationId);
        return [
          r.referralDate,
          r.patientInitialsOrAnonId,
          `"${r.patientFullName || ""}"`,
          r.patientDob || "",
          r.patientPhone || "",
          phys ? `Dr. ${phys.firstName} ${phys.lastName}` : "",
          loc?.name || "",
          r.status,
          r.payerType || "",
          r.diagnosisCategory || "",
        ].join(",");
      }),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referrals-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-referrals-title">Referrals</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Track and manage patient referrals</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
                    <Label>Physician *</Label>
                    <select name="physicianId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-referral-physician">
                      <option value="">Select physician...</option>
                      {physicians?.map(p => <option key={p.id} value={p.id}>Dr. {p.firstName} {p.lastName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location *</Label>
                    <select name="locationId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-referral-location">
                      <option value="">Select location...</option>
                      {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Referral Date *</Label>
                      <Input name="referralDate" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required data-testid="input-referral-date" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Patient ID *</Label>
                      <Input name="patientInitialsOrAnonId" required placeholder="e.g. JD-001" data-testid="input-referral-patient-id" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Patient Full Name</Label>
                    <Input name="patientFullName" placeholder="e.g. John Doe" data-testid="input-referral-patient-name" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Date of Birth</Label>
                      <Input name="patientDob" type="date" data-testid="input-referral-patient-dob" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone Number</Label>
                      <Input name="patientPhone" type="tel" placeholder="(615) 555-0100" data-testid="input-referral-patient-phone" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <select name="status" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-status">
                        <option value="RECEIVED">Received</option>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="EVAL_COMPLETED">Eval Completed</option>
                        <option value="DISCHARGED">Discharged</option>
                        <option value="LOST">Lost</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Payer Type</Label>
                      <select name="payerType" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-payer">
                        <option value="">-</option>
                        <option value="COMMERCIAL">Commercial</option>
                        <option value="MEDICARE">Medicare</option>
                        <option value="MEDICAID">Medicaid</option>
                        <option value="CASH">Cash</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Diagnosis Category</Label>
                    <Input name="diagnosisCategory" placeholder="e.g. Back Pain, Post-Op Knee" data-testid="input-referral-diagnosis" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
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
          <Input placeholder="Search referrals..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-referrals" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-referral-location">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
            placeholder="From"
            data-testid="input-filter-referral-date-from"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px]"
            placeholder="To"
            data-testid="input-filter-referral-date-to"
          />
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No referrals found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead className="hidden md:table-cell">DOB</TableHead>
                    <TableHead className="hidden lg:table-cell">Phone</TableHead>
                    <TableHead>Physician</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Payer</TableHead>
                    <TableHead className="hidden xl:table-cell">Diagnosis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const phys = physicians?.find(p => p.id === r.physicianId);
                    const loc = locations?.find(l => l.id === r.locationId);
                    return (
                      <TableRow key={r.id} data-testid={`row-referral-${r.id}`}>
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.referralDate), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-sm font-medium">{r.patientInitialsOrAnonId}</TableCell>
                        <TableCell className="text-sm" data-testid={`text-patient-name-${r.id}`}>{r.patientFullName || "-"}</TableCell>
                        <TableCell className="text-sm hidden md:table-cell" data-testid={`text-patient-dob-${r.id}`}>
                          {r.patientDob ? format(new Date(r.patientDob + "T00:00:00"), "MM/dd/yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-sm hidden lg:table-cell" data-testid={`text-patient-phone-${r.id}`}>{r.patientPhone || "-"}</TableCell>
                        <TableCell className="text-sm">{phys ? `Dr. ${phys.firstName} ${phys.lastName}` : "-"}</TableCell>
                        <TableCell className="text-sm hidden md:table-cell">{loc?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${statusBadge[r.status]}`}>
                            {r.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{r.payerType || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden xl:table-cell">{r.diagnosisCategory || "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
