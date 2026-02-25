import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Link2, UserX, Search, ArrowRight, Sparkles, UserPlus, CheckCircle2 } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";

export default function UnlinkedReferralsPage() {
  const [page, setPage] = useState(1);
  const [linkingReferralId, setLinkingReferralId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateProvider, setShowCreateProvider] = useState(false);
  const [npiLookup, setNpiLookup] = useState("");
  const [npiResult, setNpiResult] = useState<any>(null);
  const [npiLoading, setNpiLoading] = useState(false);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createNpi, setCreateNpi] = useState("");
  const [createSpecialty, setCreateSpecialty] = useState("");
  const [createPracticeName, setCreatePracticeName] = useState("");
  const [createCity, setCreateCity] = useState("");
  const [createState, setCreateState] = useState("");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/referrals/unlinked", page],
    queryFn: async () => {
      const res = await fetch(`/api/referrals/unlinked?page=${page}&pageSize=25`);
      return res.json();
    },
  });

  const { data: searchResults } = useQuery<any[]>({
    queryKey: ["/api/physicians/search", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const res = await fetch(`/api/physicians/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const { data: suggestedMatches, isLoading: loadingSuggestions } = useQuery<any[]>({
    queryKey: ["/api/referrals", linkingReferralId, "suggested-matches"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!linkingReferralId,
  });

  const linkMutation = useMutation({
    mutationFn: async ({ referralId, physicianId }: { referralId: string; physicianId: string }) => {
      const res = await apiRequest("POST", `/api/referrals/${referralId}/link`, { physicianId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Referral linked", description: "Successfully linked to the referring provider." });
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/unlinked"] });
      setLinkingReferralId(null);
      setSearchQuery("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const selfReferralMutation = useMutation({
    mutationFn: async (referralId: string) => {
      const res = await apiRequest("POST", `/api/referrals/${referralId}/self-referral`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Categorized", description: "Marked as self-referral / walk-in." });
      queryClient.invalidateQueries({ queryKey: ["/api/referrals/unlinked"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createProviderMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/physicians", data);
      return res.json();
    },
    onSuccess: (newPhysician) => {
      toast({ title: "Provider created", description: `Dr. ${newPhysician.firstName} ${newPhysician.lastName} has been added.` });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      if (linkingReferralId) {
        linkMutation.mutate({ referralId: linkingReferralId, physicianId: newPhysician.id });
      }
      resetCreateForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetCreateForm = () => {
    setShowCreateProvider(false);
    setNpiLookup("");
    setNpiResult(null);
    setCreateFirstName("");
    setCreateLastName("");
    setCreateNpi("");
    setCreateSpecialty("");
    setCreatePracticeName("");
    setCreateCity("");
    setCreateState("");
  };

  const handleNpiLookup = async () => {
    if (!npiLookup.trim()) return;
    setNpiLoading(true);
    setNpiResult(null);
    try {
      const res = await fetch("/api/import/verify-npis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ npis: [npiLookup.trim()] }),
      });
      if (!res.ok) throw new Error("Lookup failed");
      const data = await res.json();
      const result = data.results?.[0] || data[0];
      if (result?.valid) {
        setNpiResult(result);
        const nameParts = (result.name || "").split(" ");
        setCreateFirstName(nameParts[0] || "");
        setCreateLastName(nameParts.slice(1).join(" ") || "");
        setCreateNpi(result.npi);
        setCreateSpecialty(result.specialty || "");
        setCreateCity(result.city || "");
        setCreateState(result.state || "");
        setCreatePracticeName("");
      } else {
        setNpiResult({ valid: false, npi: npiLookup.trim() });
      }
    } catch {
      toast({ title: "NPI lookup failed", variant: "destructive" });
    } finally {
      setNpiLoading(false);
    }
  };

  const handleCreateProvider = () => {
    if (!createFirstName.trim() || !createLastName.trim()) {
      toast({ title: "First and last name are required", variant: "destructive" });
      return;
    }
    createProviderMutation.mutate({
      firstName: createFirstName.trim(),
      lastName: createLastName.trim(),
      npi: createNpi.trim() || null,
      specialty: createSpecialty.trim() || null,
      practiceName: createPracticeName.trim() || null,
      city: createCity.trim() || null,
      state: createState.trim() || null,
    });
  };

  const currentRef = data?.data?.find((r: any) => r.id === linkingReferralId);
  const showSuggestions = !!linkingReferralId && searchQuery.length < 2 && suggestedMatches && suggestedMatches.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Unlinked Referrals</h1>
        <p className="text-muted-foreground text-sm">Link orphaned referrals to referring providers or categorize as self-referrals.</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {data?.total ?? 0} Unlinked Referrals
          </CardTitle>
          <CardDescription>These referrals have no associated referring provider.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !data?.data?.length ? (
            <p className="text-center py-8 text-muted-foreground">All referrals are linked. Great job!</p>
          ) : (
            <div className="space-y-2">
              {data.data.map((ref: any) => (
                <div key={ref.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition" data-testid={`unlinked-referral-${ref.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{ref.patientFullName || ref.patientAccountNumber || "Unknown Patient"}</span>
                      <Badge variant="outline" className="text-xs">{ref.status}</Badge>
                      {ref.referralDate && <span className="text-xs text-muted-foreground">{ref.referralDate}</span>}
                    </div>
                    {ref.referringProviderName && (
                      <p className="text-xs text-muted-foreground mt-0.5">Originally listed: <span className="font-medium text-foreground">{ref.referringProviderName}</span></p>
                    )}
                    {ref.caseTitle && <p className="text-xs text-muted-foreground">{ref.caseTitle}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { setLinkingReferralId(ref.id); setSearchQuery(""); resetCreateForm(); }} data-testid={`button-link-${ref.id}`}>
                      <Link2 className="w-3.5 h-3.5 mr-1" /> Link
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => selfReferralMutation.mutate(ref.id)} disabled={selfReferralMutation.isPending} data-testid={`button-self-referral-${ref.id}`}>
                      <UserX className="w-3.5 h-3.5 mr-1" /> Self-Referral
                    </Button>
                  </div>
                </div>
              ))}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <span className="text-sm text-muted-foreground">Page {page} of {data.totalPages}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!linkingReferralId} onOpenChange={(open) => { if (!open) { setLinkingReferralId(null); resetCreateForm(); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link to Referring Provider</DialogTitle>
            <DialogDescription>Search for and select the referring provider to link this referral to</DialogDescription>
            {currentRef?.referringProviderName && (
              <p className="text-sm text-muted-foreground mt-1">Matching: <span className="font-medium">{currentRef.referringProviderName}</span></p>
            )}
          </DialogHeader>

          {!showCreateProvider ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by name or NPI..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-provider-link" />
              </div>

              {showSuggestions && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Suggested Matches</span>
                  </div>
                  <div className="space-y-1">
                    {suggestedMatches.map((p: any) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 flex items-center justify-between text-sm transition"
                        onClick={() => linkMutation.mutate({ referralId: linkingReferralId!, physicianId: p.id })}
                        data-testid={`suggested-provider-${p.id}`}
                      >
                        <div>
                          <span className="font-medium">{p.lastName}, {p.firstName}</span>
                          {p.credentials && <span className="text-muted-foreground">, {p.credentials}</span>}
                          {p.npi && <span className="text-xs text-muted-foreground ml-2">NPI: {p.npi}</span>}
                          {p.practiceName && <span className="text-xs text-muted-foreground ml-2">&middot; {p.practiceName}</span>}
                        </div>
                        <ArrowRight className="w-4 h-4 text-amber-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {loadingSuggestions && searchQuery.length < 2 && (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground ml-2">Finding suggested matches...</span>
                </div>
              )}

              <div className="max-h-60 overflow-y-auto space-y-1">
                {searchQuery.length >= 2 && searchResults?.map((p: any) => (
                  <button key={p.id} className="w-full text-left px-3 py-2 rounded hover:bg-accent flex items-center justify-between text-sm" onClick={() => linkMutation.mutate({ referralId: linkingReferralId!, physicianId: p.id })} data-testid={`link-provider-${p.id}`}>
                    <div>
                      <span className="font-medium">{p.lastName}, {p.firstName}</span>
                      {p.credentials && <span className="text-muted-foreground">, {p.credentials}</span>}
                      {p.npi && <span className="text-xs text-muted-foreground ml-2">NPI: {p.npi}</span>}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
                {searchQuery.length >= 2 && (!searchResults || searchResults.length === 0) && (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-sm text-muted-foreground">No providers found</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreateProvider(true)}
                      data-testid="button-create-new-provider"
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                      Add New Referring Provider
                    </Button>
                  </div>
                )}
                {searchQuery.length < 2 && !showSuggestions && !loadingSuggestions && (
                  <p className="text-sm text-muted-foreground text-center py-4">Type at least 2 characters to search</p>
                )}
              </div>

              <div className="border-t pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setShowCreateProvider(true)}
                  data-testid="button-show-create-provider"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Can't find the provider? Add a new one
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Look up by NPI number</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter NPI number..."
                    value={npiLookup}
                    onChange={(e) => setNpiLookup(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    data-testid="input-npi-lookup"
                  />
                  <Button
                    size="sm"
                    onClick={handleNpiLookup}
                    disabled={npiLoading || npiLookup.length < 10}
                    data-testid="button-npi-lookup"
                  >
                    {npiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {npiResult && (
                  <div className={`text-xs px-2 py-1.5 rounded border ${npiResult.valid ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400" : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"}`}>
                    {npiResult.valid ? (
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Found: {npiResult.name} {npiResult.specialty ? `— ${npiResult.specialty}` : ""} {npiResult.city ? `(${npiResult.city}, ${npiResult.state})` : ""}
                      </span>
                    ) : (
                      <span>NPI {npiResult.npi} not found in the NPI registry</span>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Or enter provider details manually</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      value={createFirstName}
                      onChange={(e) => setCreateFirstName(e.target.value)}
                      placeholder="First name"
                      data-testid="input-create-firstname"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      value={createLastName}
                      onChange={(e) => setCreateLastName(e.target.value)}
                      placeholder="Last name"
                      data-testid="input-create-lastname"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">NPI</Label>
                    <Input
                      value={createNpi}
                      onChange={(e) => setCreateNpi(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="NPI number"
                      data-testid="input-create-npi"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Specialty</Label>
                    <Input
                      value={createSpecialty}
                      onChange={(e) => setCreateSpecialty(e.target.value)}
                      placeholder="e.g. Orthopedics"
                      data-testid="input-create-specialty"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Practice Name</Label>
                  <Input
                    value={createPracticeName}
                    onChange={(e) => setCreatePracticeName(e.target.value)}
                    placeholder="Practice or office name"
                    data-testid="input-create-practice"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">City</Label>
                    <Input
                      value={createCity}
                      onChange={(e) => setCreateCity(e.target.value)}
                      placeholder="City"
                      data-testid="input-create-city"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">State</Label>
                    <Input
                      value={createState}
                      onChange={(e) => setCreateState(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="ST"
                      maxLength={2}
                      data-testid="input-create-state"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { resetCreateForm(); }}
                  data-testid="button-back-to-search"
                >
                  Back to Search
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateProvider}
                  disabled={createProviderMutation.isPending || !createFirstName.trim() || !createLastName.trim()}
                  data-testid="button-create-and-link"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  {createProviderMutation.isPending ? "Creating..." : "Create & Link Provider"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
