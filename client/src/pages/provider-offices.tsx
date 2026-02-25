import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, Building2, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Users, FileText, Phone, MapPin, X, Clock, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";

const RECENT_SEARCHES_KEY = "tristar360_provider_offices_recent";
const MAX_RECENT = 8;

function useRecentSearches(userId: string | undefined) {
  const storageKey = userId ? `${RECENT_SEARCHES_KEY}_${userId}` : RECENT_SEARCHES_KEY;

  const getRecent = useCallback((): string[] => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const [recent, setRecent] = useState<string[]>(getRecent);

  const addRecent = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  }, [storageKey]);

  const clearRecent = useCallback(() => {
    localStorage.removeItem(storageKey);
    setRecent([]);
  }, [storageKey]);

  return { recent, addRecent, clearRecent };
}

function OfficeProviders({ officeName }: { officeName: string }) {
  const { data: providers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/provider-offices", officeName, "providers"],
    queryFn: async () => {
      const res = await fetch(`/api/provider-offices/${encodeURIComponent(officeName)}/providers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load providers");
      return res.json();
    },
    enabled: !!officeName,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (!providers?.length) {
    return <p className="p-4 text-sm text-muted-foreground">No providers found for this office.</p>;
  }

  return (
    <div className="border-t">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-xs">Provider Name</TableHead>
            <TableHead className="text-xs">Specialty</TableHead>
            <TableHead className="text-xs">NPI</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Stage</TableHead>
            <TableHead className="text-xs text-right">Referrals</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((p: any) => (
            <TableRow key={p.id} className="hover:bg-muted/20">
              <TableCell>
                <Link href={`/physicians/${p.id}`} className="text-primary hover:underline font-medium text-sm" data-testid={`link-provider-${p.id}`}>
                  {p.lastName}, {p.firstName}{p.credentials ? `, ${p.credentials}` : ""}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.specialty || "—"}</TableCell>
              <TableCell className="text-sm font-mono text-muted-foreground">{p.npi || "—"}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{p.status}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{p.relationshipStage?.replace("_", " ")}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary" className="text-xs">{p.referralCount}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function ProviderOfficesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);
  const { recent, addRecent, clearRecent } = useRecentSearches(user?.id);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const canManage = user && ["OWNER", "DIRECTOR", "MARKETER"].includes((user as any).role);

  const addOfficeMutation = useMutation({
    mutationFn: async (data: { practiceName: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; fax?: string }) => {
      const res = await apiRequest("POST", "/api/physicians", {
        firstName: data.practiceName,
        lastName: "(Office)",
        practiceName: data.practiceName,
        primaryOfficeAddress: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        phone: data.phone || null,
        fax: data.fax || null,
        status: "PROSPECT",
        relationshipStage: "NEW",
        priority: "MEDIUM",
      });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider-offices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/practice-names"] });
      setAddDialogOpen(false);
      toast({ title: "Office added", description: `"${vars.practiceName}" has been created. You can now add providers to it.` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAddOffice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addOfficeMutation.mutate({
      practiceName: (fd.get("practiceName") as string).trim(),
      address: (fd.get("address") as string)?.trim() || undefined,
      city: (fd.get("city") as string)?.trim() || undefined,
      state: (fd.get("state") as string)?.trim() || undefined,
      zip: (fd.get("zip") as string)?.trim() || undefined,
      phone: (fd.get("phone") as string)?.trim() || undefined,
      fax: (fd.get("fax") as string)?.trim() || undefined,
    });
  };

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const queryParams = new URLSearchParams({
    search: debouncedSearch,
    page: page.toString(),
    pageSize: "50",
    sortBy: "providerCount",
    sortOrder: "desc",
  }).toString();

  const { data: result, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["/api/provider-offices", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/provider-offices?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load offices");
      return res.json();
    },
  });

  const offices = result?.data || [];
  const total = result?.total || 0;
  const totalPages = result?.totalPages || 1;

  const handleSearchSubmit = () => {
    if (search.trim()) addRecent(search.trim());
  };

  const handleRecentClick = (term: string) => {
    setSearch(term);
    addRecent(term);
  };

  const handleToggleOffice = (name: string) => {
    if (expandedOffice === name) {
      setExpandedOffice(null);
    } else {
      setExpandedOffice(name);
      addRecent(name);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-offices-title">Provider Offices</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{total} offices with linked providers</p>
        </div>
        {canManage && (
          <Button onClick={() => setAddDialogOpen(true)} data-testid="button-add-office">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Office
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search offices by name, address, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(); }}
            className="pl-8"
            data-testid="input-search-offices"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {recent.length > 0 && !search && (
        <Card className="border-dashed">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Recent Searches
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearRecent} data-testid="button-clear-recent">
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((term) => (
                <Badge
                  key={term}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
                  onClick={() => handleRecentClick(term)}
                  data-testid={`badge-recent-${term.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {term}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-10 w-10 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground mb-3" data-testid="text-offices-error">Failed to load provider offices</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-retry-offices">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : offices.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No offices found{search ? ` matching "${search}"` : ""}.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {offices.map((office: any) => {
            const isExpanded = expandedOffice === office.office_name;
            return (
              <Card key={office.office_name} className={isExpanded ? "border-primary/40" : ""} data-testid={`card-office-${office.office_name.replace(/\s+/g, "-").toLowerCase()}`}>
                <Collapsible open={isExpanded} onOpenChange={() => handleToggleOffice(office.office_name)}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full text-left" data-testid={`button-expand-${office.office_name.replace(/\s+/g, "-").toLowerCase()}`}>
                      <CardContent className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{office.office_name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              {(office.city || office.state) && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {[office.city, office.state].filter(Boolean).join(", ")}
                                </span>
                              )}
                              {office.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {office.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                <Users className="h-3 w-3 mr-1" />
                                {office.provider_count} provider{office.provider_count != 1 ? "s" : ""}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <FileText className="h-3 w-3 mr-1" />
                                {office.total_referrals} referral{office.total_referrals != 1 ? "s" : ""}
                              </Badge>
                            </div>
                          </div>
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </CardContent>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <OfficeProviders officeName={office.office_name} />
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages} ({total} offices)</p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-prev-page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} data-testid="button-next-page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Add New Office
            </DialogTitle>
            <DialogDescription>Add a new provider office to the directory</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddOffice} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Office / Practice Name *</Label>
              <Input name="practiceName" required placeholder="e.g. Knoxville Orthopedics" data-testid="input-office-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input name="address" placeholder="Street address" data-testid="input-office-address" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input name="city" placeholder="City" data-testid="input-office-city" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input name="state" placeholder="TN" maxLength={2} data-testid="input-office-state" />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP</Label>
                <Input name="zip" placeholder="37901" data-testid="input-office-zip" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input name="phone" placeholder="(865) 555-0100" data-testid="input-office-phone" />
              </div>
              <div className="space-y-1.5">
                <Label>Fax</Label>
                <Input name="fax" placeholder="(865) 555-0101" data-testid="input-office-fax" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This creates the office so you can assign providers to it. Add providers by editing their practice name.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addOfficeMutation.isPending} data-testid="button-submit-office">
                {addOfficeMutation.isPending ? "Adding..." : "Add Office"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
