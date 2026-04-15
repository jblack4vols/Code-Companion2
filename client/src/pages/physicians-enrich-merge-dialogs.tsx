import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Merge } from "lucide-react";
import { MergeByNpiPanel } from "./physicians-detail-dialog";

type EnrichResult = { total: number; enriched: number; alreadyComplete: number; failed: number };

interface PhysiciansEnrichDialogProps {
  open: boolean;
  result: EnrichResult | null;
  onClose: () => void;
}

export function PhysiciansEnrichDialog({ open, result, onClose }: PhysiciansEnrichDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>NPI Enrichment Complete</DialogTitle>
          <DialogDescription>Results from enriching provider records using the NPPES registry</DialogDescription>
        </DialogHeader>
        {result && (
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="rounded-md bg-muted p-3 text-center"><div className="text-2xl font-bold">{result.total}</div><div className="text-xs text-muted-foreground">Candidates</div></div>
            <div className="rounded-md bg-chart-2/10 p-3 text-center"><div className="text-2xl font-bold text-chart-2">{result.enriched}</div><div className="text-xs text-muted-foreground">Enriched</div></div>
            <div className="rounded-md bg-muted p-3 text-center"><div className="text-2xl font-bold text-muted-foreground">{result.alreadyComplete}</div><div className="text-xs text-muted-foreground">Already Complete</div></div>
            <div className="rounded-md bg-chart-5/10 p-3 text-center"><div className="text-2xl font-bold text-chart-5">{result.failed}</div><div className="text-xs text-muted-foreground">Failed</div></div>
          </div>
        )}
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}

interface PhysiciansMergeDialogProps {
  open: boolean;
  mergeNpi: string;
  setMergeNpi: (v: string) => void;
  mergeMutation: { mutate: (args: { keepId: string; removeId: string }, opts?: { onSuccess?: () => void }) => void; isPending: boolean };
  onClose: () => void;
}

export function PhysiciansMergeDialog({ open, mergeNpi, setMergeNpi, mergeMutation, onClose }: PhysiciansMergeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle><span className="flex items-center gap-2"><Merge className="w-4 h-4" />Merge Referring Providers by NPI</span></DialogTitle>
          <DialogDescription>Enter an NPI to find duplicate referring providers and merge them into one record</DialogDescription>
        </DialogHeader>
        <MergeByNpiPanel mergeNpi={mergeNpi} setMergeNpi={setMergeNpi} mergeMutation={mergeMutation} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
