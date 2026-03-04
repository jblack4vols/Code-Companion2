import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Filter, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Stethoscope, Users, Activity, MapPin } from "lucide-react";
import { format, subMonths } from "date-fns";
import type { Location } from "@shared/schema";
import { useDebounce } from "@/hooks/use-debounce";

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  SCHEDULED: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  EVAL_COMPLETED: "bg-green-500/10 text-green-700 dark:text-green-400",
  ACTIVE: "bg-green-500/10 text-green-700 dark:text-green-400",
  IN_TREATMENT: "bg-green-500/10 text-green-700 dark:text-green-400",
  DISCHARGED: "bg-muted text-muted-foreground",
  LOST: "bg-red-500/10 text-red-700 dark:text-red-400",
  NO_SHOW: "bg-red-500/10 text-red-700 dark:text-red-400",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "MM/dd/yyyy"); } catch { return d; }
}

export default function ReferralExplorerPage() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(subMonths(new Date(), 12), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [locationId, setLocationId] = useState("all");
  const [referralSource, setReferralSource] = useState("all");
  const [primaryPayerType, setPrimaryPayerType] = useState("all");
  const [status, setStatus] = useState("all");
  const [discipline, setDiscipline] = useState("all");
  const [sortBy, setSortBy] = useState("referralDate");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const pageSize = 50;

  const debouncedSearch = useDebounce(search, 300);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (locationId !== "all") params.set("locationId", locationId);
  if (referralSource !== "all") params.set("referralSource", referralSource);
  if (primaryPayerType !== "all") params.set("primaryPayerType", primaryPayerType);
  if (status !== "all") params.set("status", status);
  if (discipline !== "all") params.set("discipline", discipline);
  params.set("sortBy", sortBy);
  params.set("sortDir", sortDir);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const queryParams = params.toString();

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/referrals/paginated", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/referrals/paginated?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: filterOptions } = useQuery<any>({
    queryKey: ["/api/referrals/filter-options"],
  });

  const referrals = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const activeCount = data?.activeCount || 0;
  const dischargedCount = data?.dischargedCount || 0;

  const stats = useMemo(() => {
    let totalArrived = 0;
    const docs: Record<string, number> = {};
    for (const r of referrals) {
      totalArrived += r.arrivedVisits || 0;
      const docName = r.physicianLastName ? `${r.physicianFirstName || ""} ${r.physicianLastName}`.trim() : r.referringProviderName;
      if (docName) docs[docName] = (docs[docName] || 0) + 1;
    }
    const topDoc = Object.entries(docs).sort((a, b) => b[1] - a[1])[0];
    return { totalArrived, topDoc };
  }, [referrals]);

  const handleSort = (col: string) => {
    if (col === sortBy) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setDateFrom(format(subMonths(new Date(), 12), "yyyy-MM-dd"));
    setDateTo(format(new Date(), "yyyy-MM-dd"));
    setLocationId("all");
    setReferralSource("all");
    setPrimaryPayerType("all");
    setStatus("all");
    setDiscipline("all");
    setPage(1);
  };

  const hasActiveFilters = locationId !== "all" || referralSource !== "all" || primaryPayerType !== "all" || status !== "all" || discipline !== "all";

  const SortIcon = ({ col }: { col: string }) => {
    if (col !== sortBy) return <span className="ml-1 text-muted-foreground/40 text-[10px]">⇅</span>;
    return <span className="ml-1 text-foreground text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="page-header">
        <div>
          <h1 data-testid="text-explorer-title">Referral Explorer</h1>
          <p className="page-subtitle">Deep-dive into referral cases across all locations</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-primary/10 text-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Filtered</p>
              <p className="text-2xl font-bold" data-testid="text-stat-filtered">{isLoading ? "—" : total.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/10 text-chart-2">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold" data-testid="text-stat-active">{isLoading ? "—" : activeCount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-4/10 text-chart-4">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Arrived Visits</p>
              <p className="text-2xl font-bold" data-testid="text-stat-arrived">{isLoading ? "—" : stats.totalArrived.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-5/10 text-chart-5">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Top Referrer</p>
              <p className="text-sm font-bold truncate max-w-[140px]" data-testid="text-stat-top-referrer">
                {isLoading ? "—" : stats.topDoc ? `${stats.topDoc[0].split(" ").pop()} (${stats.topDoc[1]})` : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Patient, physician, therapist, diagnosis..."
                className="pl-9"
                data-testid="input-explorer-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-[140px]" data-testid="input-date-from" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-[140px]" data-testid="input-date-to" />
            </div>
            <Button variant={showFilters ? "secondary" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)} className="toggle-elevate" data-testid="button-toggle-filters">
              <Filter className="w-4 h-4 mr-1" />
              Filters
              {hasActiveFilters && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{[locationId, referralSource, primaryPayerType, status, discipline].filter(v => v !== "all").length}</Badge>}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Location</label>
                <Select value={locationId} onValueChange={v => { setLocationId(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-location"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations?.filter(l => l.isActive).map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Referral Source</label>
                <Select value={referralSource} onValueChange={v => { setReferralSource(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-referral-source"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {filterOptions?.referralSources?.map((s: string) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Payer Type</label>
                <Select value={primaryPayerType} onValueChange={v => { setPrimaryPayerType(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-payer-type"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payers</SelectItem>
                    {filterOptions?.payerTypes?.map((p: string) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Status</label>
                <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-status"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="RECEIVED">Received</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="EVAL_COMPLETED">Eval Completed</SelectItem>
                    <SelectItem value="IN_TREATMENT">In Treatment</SelectItem>
                    <SelectItem value="DISCHARGED">Discharged</SelectItem>
                    <SelectItem value="LOST">Lost</SelectItem>
                    <SelectItem value="NO_SHOW">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Discipline</label>
                <Select value={discipline} onValueChange={v => { setDiscipline(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-discipline"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {filterOptions?.disciplines?.map((d: string) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p data-testid="text-result-count">
          {isLoading ? "Loading..." : `${total.toLocaleString()} case${total !== 1 ? "s" : ""} found`}
          {dischargedCount > 0 && !isLoading && ` (${dischargedCount.toLocaleString()} discharged)`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium" data-testid="text-page-info">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("referralDate")} data-testid="th-date">
                  Date <SortIcon col="referralDate" />
                </TableHead>
                <TableHead className="whitespace-nowrap">Location</TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("patientFullName")} data-testid="th-patient">
                  Patient <SortIcon col="patientFullName" />
                </TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("referringProviderName")} data-testid="th-doctor">
                  Referring MD <SortIcon col="referringProviderName" />
                </TableHead>
                <TableHead className="whitespace-nowrap">Source</TableHead>
                <TableHead className="whitespace-nowrap">Payer</TableHead>
                <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("status")} data-testid="th-status">
                  Status <SortIcon col="status" />
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">Visits</TableHead>
                <TableHead className="whitespace-nowrap">Disc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={10}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-destructive">
                    Failed to load referrals. Please try again.
                  </TableCell>
                </TableRow>
              ) : referrals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    No referrals match your filters
                  </TableCell>
                </TableRow>
              ) : (
                referrals.map((r: any) => {
                  const isExpanded = expandedId === r.id;
                  const docName = r.physicianLastName
                    ? `${r.physicianFirstName || ""} ${r.physicianLastName}${r.physicianCredentials ? `, ${r.physicianCredentials}` : ""}`
                    : (r.referringProviderName || "—");
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover-elevate group"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      data-testid={`row-referral-${r.id}`}
                    >
                      <TableCell className="w-8 px-2">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.referralDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] font-medium">{r.locationName || "—"}</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm max-w-[180px] truncate">{r.patientFullName || r.patientInitialsOrAnonId || "—"}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{docName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{r.referralSource || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">{r.primaryPayerType || "—"}</TableCell>
                      <TableCell>
                        <Badge className={`text-[11px] ${STATUS_STYLES[r.status] || "bg-muted text-muted-foreground"}`} variant="outline">
                          {r.status?.replace(/_/g, " ") || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {r.arrivedVisits ?? 0}
                        <span className="text-muted-foreground/50">/{r.scheduledVisits ?? 0}</span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{r.discipline || "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {referrals.map((r: any) => {
            if (expandedId !== r.id) return null;
            return (
              <div key={`detail-${r.id}`} className="border-t bg-muted/30 px-6 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Therapist</p>
                    <p className="font-medium" data-testid={`text-therapist-${r.id}`}>{r.caseTherapist || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Diagnosis</p>
                    <p className="font-medium" data-testid={`text-diagnosis-${r.id}`}>{r.diagnosisCategory || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Insurance</p>
                    <p className="font-medium" data-testid={`text-insurance-${r.id}`}>{r.primaryInsurance || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Scheduled Visits</p>
                    <p className="font-medium" data-testid={`text-scheduled-${r.id}`}>{r.scheduledVisits ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Discharge Date</p>
                    <p className="font-medium" data-testid={`text-discharge-date-${r.id}`}>{fmtDate(r.dischargeDate)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Discharge Reason</p>
                    <p className="font-medium" data-testid={`text-discharge-reason-${r.id}`}>{r.dischargeReason || "—"}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page-bottom">
            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage(p => p + 1)} data-testid="button-next-page-bottom">
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
