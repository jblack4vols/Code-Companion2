import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Link2, UserX, Search, ArrowRight } from "lucide-react";

export default function UnlinkedReferralsPage() {
  const [page, setPage] = useState(1);
  const [linkingReferralId, setLinkingReferralId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
                      <p className="text-xs text-muted-foreground mt-0.5">Originally listed: {ref.referringProviderName}</p>
                    )}
                    {ref.caseTitle && <p className="text-xs text-muted-foreground">{ref.caseTitle}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => { setLinkingReferralId(ref.id); setSearchQuery(""); }} data-testid={`button-link-${ref.id}`}>
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

      <Dialog open={!!linkingReferralId} onOpenChange={() => setLinkingReferralId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link to Referring Provider</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or NPI..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-provider-link" />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {searchResults?.map((p: any) => (
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
                <p className="text-sm text-muted-foreground text-center py-4">No providers found</p>
              )}
              {searchQuery.length < 2 && (
                <p className="text-sm text-muted-foreground text-center py-4">Type at least 2 characters to search</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}