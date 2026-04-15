import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building2, Users, Merge } from "lucide-react";
import { Link } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import type { Physician } from "@shared/schema";

type PhysicianWithCount = Physician & { referralCount?: number };
const statusBadge: Record<string, string> = { PROSPECT: "bg-chart-1/15 text-chart-1", ACTIVE: "bg-chart-4/15 text-chart-4", INACTIVE: "bg-muted text-muted-foreground" };

// ── Practice detail dialog ────────────────────────────────────────────────────

interface PracticeDetailDialogProps {
  practiceName: string | null;
  onClose: () => void;
  onFilterByPractice: (name: string) => void;
}

export function PracticeDetailDialog({ practiceName, onClose, onFilterByPractice }: PracticeDetailDialogProps) {
  const { data: result } = useQuery<{ data: PhysicianWithCount[] }>({
    queryKey: ["/api/physicians/paginated", "practice-detail", practiceName],
    queryFn: async () => {
      const params = new URLSearchParams({ practiceName: practiceName!, page: "1", pageSize: "100" });
      const res = await fetch(`/api/physicians/paginated?${params}`, { credentials: "include" });
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
            <Building2 className="w-4 h-4" />{practiceName}
          </DialogTitle>
          <DialogDescription>{providers.length} provider{providers.length !== 1 ? "s" : ""} at this practice</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {providers.map((p) => (
            <Link key={p.id} href={`/physicians/${p.id}`}>
              <div className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer" data-testid={`practice-provider-${p.id}`}>
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-medium shrink-0">{p.firstName[0]}{p.lastName[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{[p.npi ? `NPI: ${p.npi}` : null, p.specialty, p.city, p.state].filter(Boolean).join(" \u00b7 ") || "No details"}</p>
                </div>
                <div className="text-right shrink-0">
                  {Number(p.referralCount) > 0 && <Badge variant="secondary" className="text-[10px]">{Number(p.referralCount)} referrals</Badge>}
                </div>
              </div>
            </Link>
          ))}
          {providers.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />No providers found
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

// ── Merge by NPI panel ────────────────────────────────────────────────────────

interface MergeByNpiPanelProps {
  mergeNpi: string;
  setMergeNpi: (v: string) => void;
  mergeMutation: { mutate: (args: { keepId: string; removeId: string }, opts?: { onSuccess?: () => void }) => void; isPending: boolean };
  onClose: () => void;
}

export function MergeByNpiPanel({ mergeNpi, setMergeNpi, mergeMutation, onClose }: MergeByNpiPanelProps) {
  const [keepId, setKeepId] = useState<string | null>(null);
  const debouncedNpi = useDebounce(mergeNpi, 400);

  const { data: matches, isLoading } = useQuery<PhysicianWithCount[]>({
    queryKey: ["/api/physicians/by-npi", debouncedNpi],
    queryFn: async () => {
      const res = await fetch(`/api/physicians/by-npi?npi=${encodeURIComponent(debouncedNpi)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: debouncedNpi.length >= 5,
  });

  const handleMerge = (removeId: string) => {
    if (!keepId || keepId === removeId) return;
    mergeMutation.mutate({ keepId, removeId }, { onSuccess: () => { setKeepId(null); setMergeNpi(""); } });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>NPI Number</Label>
        <Input placeholder="Enter NPI to find matching providers..." value={mergeNpi} onChange={(e) => { setMergeNpi(e.target.value); setKeepId(null); }} className="font-mono" data-testid="input-merge-npi" />
      </div>
      {isLoading && debouncedNpi.length >= 5 && <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
      {matches && matches.length === 0 && debouncedNpi.length >= 5 && <div className="text-center py-6 text-sm text-muted-foreground">No providers found with this NPI</div>}
      {matches && matches.length === 1 && <div className="text-center py-6 text-sm text-muted-foreground">Only one provider with this NPI - no duplicates to merge</div>}
      {matches && matches.length > 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{matches.length} providers share NPI <span className="font-mono font-medium">{debouncedNpi}</span>. Select the primary record to keep, then merge duplicates into it.</p>
          <div className="space-y-2">
            {matches.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${keepId === p.id ? "border-primary bg-primary/5" : ""}`} onClick={() => setKeepId(p.id)} data-testid={`merge-candidate-${p.id}`}>
                <input type="radio" name="keepId" checked={keepId === p.id} onChange={() => setKeepId(p.id)} className="accent-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">NPI: {p.npi}</span>
                    {p.practiceName && <span>{p.practiceName}</span>}
                    {p.city && <span>{p.city}, {p.state}</span>}
                    {p.phone && <span>{p.phone}</span>}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className={`text-[10px] ${statusBadge[p.status]}`}>{p.status}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{p.referralCount || 0} referrals</Badge>
                  </div>
                </div>
                {keepId && keepId !== p.id && (
                  <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleMerge(p.id); }} disabled={mergeMutation.isPending} data-testid={`button-merge-${p.id}`}>
                    <Merge className="w-3 h-3 mr-1" />{mergeMutation.isPending ? "Merging..." : "Merge Into Primary"}
                  </Button>
                )}
                {keepId === p.id && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">Primary</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end pt-2"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </div>
  );
}
