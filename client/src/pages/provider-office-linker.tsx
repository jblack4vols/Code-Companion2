import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Link2, Building2, CheckCircle, AlertCircle, Loader2, ExternalLink, Zap } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

interface Physician {
  id: string;
  firstName: string;
  lastName: string;
  credentials: string | null;
  npi: string | null;
  practiceName: string | null;
  specialty: string | null;
  city: string | null;
  state: string | null;
}

interface NpiResult {
  npi: string;
  firstName: string;
  lastName: string;
  credentials: string;
  specialty: string | null;
  organizationName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
}

interface PendingLink {
  physicianId: string;
  physicianName: string;
  practiceName: string;
  npi: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  specialty?: string;
  credentials?: string;
}

export default function ProviderOfficeLinkerPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterLinked, setFilterLinked] = useState<string>("unlinked");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lookupPhysician, setLookupPhysician] = useState<Physician | null>(null);
  const [npiResults, setNpiResults] = useState<NpiResult[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [bulkPractice, setBulkPractice] = useState("");
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const queryParams = new URLSearchParams();
  queryParams.set("page", "1");
  queryParams.set("pageSize", "500");
  if (debouncedSearch) queryParams.set("search", debouncedSearch);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/physicians/paginated", debouncedSearch, "linker"],
    queryFn: async () => {
      const res = await fetch(`/api/physicians/paginated?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: officesList } = useQuery<any>({
    queryKey: ["/api/provider-offices"],
  });

  const existingOffices = useMemo(() => {
    if (!officesList) return [];
    return (officesList as any[]).map((o: any) => o.office_name || o.officeName).filter(Boolean).sort();
  }, [officesList]);

  const physicians: Physician[] = useMemo(() => {
    const all = data?.data || [];
    if (filterLinked === "unlinked") return all.filter((p: Physician) => !p.practiceName || p.practiceName.trim() === "");
    if (filterLinked === "linked") return all.filter((p: Physician) => p.practiceName && p.practiceName.trim() !== "");
    return all;
  }, [data, filterLinked]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === physicians.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(physicians.map(p => p.id)));
  };

  const handleNpiLookup = async (physician: Physician) => {
    setLookupPhysician(physician);
    setNpiResults([]);
    setIsLookingUp(true);

    try {
      const body: any = {};
      if (physician.npi) {
        body.npi = physician.npi;
      } else {
        body.firstName = physician.firstName;
        body.lastName = physician.lastName;
      }
      const res = await apiRequest("POST", "/api/import/npi-lookup", body);
      const data = await res.json();
      setNpiResults(data.results || []);
    } catch {
      toast({ title: "Lookup failed", description: "Could not reach NPI Registry", variant: "destructive" });
    } finally {
      setIsLookingUp(false);
    }
  };

  const addToQueue = (physician: Physician, npiResult: NpiResult) => {
    const existing = pendingLinks.find(l => l.physicianId === physician.id);
    if (existing) {
      setPendingLinks(prev => prev.map(l => l.physicianId === physician.id ? {
        ...l,
        practiceName: npiResult.organizationName || l.practiceName,
        npi: npiResult.npi,
        address: npiResult.address || undefined,
        city: npiResult.city || undefined,
        state: npiResult.state || undefined,
        zip: npiResult.zip || undefined,
        phone: npiResult.phone || undefined,
        specialty: npiResult.specialty || undefined,
        credentials: npiResult.credentials || undefined,
      } : l));
    } else {
      setPendingLinks(prev => [...prev, {
        physicianId: physician.id,
        physicianName: `${physician.firstName} ${physician.lastName}`,
        practiceName: npiResult.organizationName || "",
        npi: npiResult.npi,
        address: npiResult.address || undefined,
        city: npiResult.city || undefined,
        state: npiResult.state || undefined,
        zip: npiResult.zip || undefined,
        phone: npiResult.phone || undefined,
        specialty: npiResult.specialty || undefined,
        credentials: npiResult.credentials || undefined,
      }]);
    }
    setLookupPhysician(null);
    toast({ title: "Added to queue", description: `${physician.firstName} ${physician.lastName} → ${npiResult.organizationName || "Unknown office"}` });
  };

  const handleBulkAssign = () => {
    if (!bulkPractice.trim() || selectedIds.size === 0) return;
    const newLinks: PendingLink[] = [];
    for (const id of selectedIds) {
      const p = physicians.find(ph => ph.id === id);
      if (!p) continue;
      if (pendingLinks.some(l => l.physicianId === id)) {
        setPendingLinks(prev => prev.map(l => l.physicianId === id ? { ...l, practiceName: bulkPractice.trim() } : l));
      } else {
        newLinks.push({
          physicianId: id,
          physicianName: `${p.firstName} ${p.lastName}`,
          practiceName: bulkPractice.trim(),
          npi: p.npi || "",
        });
      }
    }
    setPendingLinks(prev => [...prev, ...newLinks]);
    setShowBulkDialog(false);
    setSelectedIds(new Set());
    setBulkPractice("");
    toast({ title: "Added to queue", description: `${selectedIds.size} providers → ${bulkPractice.trim()}` });
  };

  const removeFromQueue = (physicianId: string) => {
    setPendingLinks(prev => prev.filter(l => l.physicianId !== physicianId));
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/import/bulk-link-offices", { links: pendingLinks });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Offices linked",
        description: `${data.updated} provider${data.updated !== 1 ? "s" : ""} updated${data.failed > 0 ? `, ${data.failed} failed` : ""}`,
      });
      setPendingLinks([]);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider-offices"] });
    },
    onError: () => {
      toast({ title: "Failed to apply", description: "Something went wrong", variant: "destructive" });
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="page-header">
        <div>
          <h1 data-testid="text-linker-title">Provider Office Linker</h1>
          <p className="page-subtitle">Link referring providers to their practice offices using NPI Registry data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Referring Providers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, NPI, or practice..."
                    className="pl-9"
                    data-testid="input-search-providers"
                  />
                </div>
                <Select value={filterLinked} onValueChange={setFilterLinked}>
                  <SelectTrigger className="w-[150px]" data-testid="select-filter-linked">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="unlinked">Unlinked Only</SelectItem>
                    <SelectItem value="linked">Linked Only</SelectItem>
                  </SelectContent>
                </Select>
                {selectedIds.size > 0 && (
                  <Button size="sm" onClick={() => setShowBulkDialog(true)} data-testid="button-bulk-assign">
                    <Link2 className="w-4 h-4 mr-1" /> Link {selectedIds.size} to Office
                  </Button>
                )}
              </div>

              <div className="overflow-auto max-h-[500px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={physicians.length > 0 && selectedIds.size === physicians.length}
                          onCheckedChange={selectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>NPI</TableHead>
                      <TableHead>Current Office</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                      ))
                    ) : physicians.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {filterLinked === "unlinked" ? "All providers are linked to offices" : "No providers found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      physicians.map((p) => {
                        const queued = pendingLinks.find(l => l.physicianId === p.id);
                        return (
                          <TableRow key={p.id} className={queued ? "bg-chart-2/5" : ""} data-testid={`row-provider-${p.id}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(p.id)}
                                onCheckedChange={() => toggleSelect(p.id)}
                                data-testid={`checkbox-${p.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm">{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</div>
                              {p.specialty && <div className="text-[11px] text-muted-foreground">{p.specialty}</div>}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{p.npi || <span className="text-muted-foreground/50">—</span>}</TableCell>
                            <TableCell>
                              {queued ? (
                                <Badge variant="outline" className="bg-chart-2/10 text-chart-2 text-[11px]">
                                  → {queued.practiceName}
                                </Badge>
                              ) : p.practiceName ? (
                                <span className="text-sm">{p.practiceName}</span>
                              ) : (
                                <Badge variant="outline" className="text-[11px] text-muted-foreground">Unlinked</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleNpiLookup(p)}
                                data-testid={`button-lookup-${p.id}`}
                              >
                                <Search className="w-3 h-3 mr-1" /> Lookup
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {physicians.length} provider{physicians.length !== 1 ? "s" : ""}
                {filterLinked === "unlinked" && " without an office link"}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-4 h-4" /> Pending Links
                {pendingLinks.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{pendingLinks.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No links queued yet. Use the NPI lookup or bulk assign to add providers.
                </p>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-auto">
                  {pendingLinks.map((link) => (
                    <div key={link.physicianId} className="flex items-center gap-2 p-2 rounded-md border text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{link.physicianName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">→ {link.practiceName}</div>
                        {link.npi && <div className="text-[10px] font-mono text-muted-foreground">NPI: {link.npi}</div>}
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => removeFromQueue(link.physicianId)} data-testid={`button-remove-${link.physicianId}`}>
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {pendingLinks.length > 0 && (
                <div className="mt-4 space-y-2">
                  <Button
                    className="w-full"
                    onClick={() => applyMutation.mutate()}
                    disabled={applyMutation.isPending}
                    data-testid="button-apply-links"
                  >
                    {applyMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Applying...</>
                    ) : (
                      <><CheckCircle className="w-4 h-4 mr-2" /> Apply {pendingLinks.length} Link{pendingLinks.length !== 1 ? "s" : ""}</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setPendingLinks([])}
                    data-testid="button-clear-queue"
                  >
                    Clear All
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4" /> Quick Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p><strong>Individual:</strong> Click "Lookup" next to a provider to search the NPI Registry and pick their office.</p>
              <p><strong>Bulk:</strong> Select multiple providers with checkboxes, then click "Link to Office" to assign them all to the same practice.</p>
              <p><strong>Review:</strong> Queued links appear in the right panel. Click "Apply" when ready to save.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!lookupPhysician} onOpenChange={(open) => { if (!open) setLookupPhysician(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              NPI Registry Lookup: {lookupPhysician?.firstName} {lookupPhysician?.lastName}
            </DialogTitle>
            <DialogDescription>
              Select a matching provider to link them to the listed practice office
            </DialogDescription>
          </DialogHeader>

          {isLookingUp ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Searching NPI Registry...
            </div>
          ) : npiResults.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
              <AlertCircle className="w-8 h-8" />
              <p>No results found in NPI Registry</p>
              <p className="text-xs">Try searching with a different name or enter the NPI directly</p>
            </div>
          ) : (
            <div className="space-y-2">
              {npiResults.map((r, idx) => (
                <div
                  key={`${r.npi}-${idx}`}
                  className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => lookupPhysician && addToQueue(lookupPhysician, r)}
                  data-testid={`npi-result-${r.npi}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{r.firstName} {r.lastName}{r.credentials ? `, ${r.credentials}` : ""}</div>
                      <div className="text-sm text-muted-foreground">{r.specialty || "No specialty listed"}</div>
                      {r.organizationName && (
                        <div className="mt-1">
                          <Badge variant="outline" className="bg-chart-2/10 text-chart-2">
                            <Building2 className="w-3 h-3 mr-1" /> {r.organizationName}
                          </Badge>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {[r.address, r.city, r.state, r.zip].filter(Boolean).join(", ")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className="font-mono text-[11px]">NPI: {r.npi}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLookupPhysician(null)} data-testid="button-close-lookup">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Assign to Office</DialogTitle>
            <DialogDescription>
              Assign {selectedIds.size} selected provider{selectedIds.size !== 1 ? "s" : ""} to a practice office
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Practice Name</label>
              <Input
                value={bulkPractice}
                onChange={e => setBulkPractice(e.target.value)}
                placeholder="Enter or select practice name..."
                data-testid="input-bulk-practice"
              />
            </div>
            {existingOffices.length > 0 && (
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Or pick an existing office</label>
                <Select value="" onValueChange={v => setBulkPractice(v)}>
                  <SelectTrigger data-testid="select-existing-office"><SelectValue placeholder="Select existing..." /></SelectTrigger>
                  <SelectContent>
                    {existingOffices.map((name: string) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)} data-testid="button-cancel-bulk">Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={!bulkPractice.trim()} data-testid="button-confirm-bulk">
              <Link2 className="w-4 h-4 mr-1" /> Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
