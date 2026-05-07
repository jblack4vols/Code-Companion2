import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export interface OfficeVisitProvider {
  id: string;
  firstName: string;
  lastName: string;
  credentials: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  officeName: string;
  providers: OfficeVisitProvider[];
}

const TYPES = ["VISIT", "CALL", "EMAIL", "EVENT", "LUNCH", "OTHER"] as const;

/**
 * Log a single in-office interaction that fans out across multiple providers.
 * Field reps walking into an office often see 2-5 providers in one visit;
 * this dialog lets them write the summary once and creates one interaction
 * per selected provider on submit (server-side audit-log gets one entry per
 * call). Failures are reported per-provider so a partial success is visible.
 */
export function OfficeVisitInteractionDialog({ open, onOpenChange, officeName, providers }: Props) {
  const { toast } = useToast();

  // Default-select all providers — most common case is "talked to everyone".
  // Reps can uncheck outliers faster than they can check the room.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<typeof TYPES[number]>("VISIT");
  const [occurredAt, setOccurredAt] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set(providers.map((p) => p.id)));
      setType("VISIT");
      setOccurredAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setSummary("");
      setNextStep("");
    }
  }, [open, providers]);

  const toggleProvider = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = providers.length > 0 && selected.size === providers.length;
  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(providers.map((p) => p.id)));
  };

  const submit = useMutation({
    mutationFn: async (): Promise<{ ok: number; failed: Array<{ id: string; name: string; error: string }> }> => {
      const ids = Array.from(selected);
      const occurredIso = new Date(occurredAt).toISOString();
      const results = await Promise.allSettled(
        ids.map((physicianId) =>
          apiRequest("POST", "/api/interactions", {
            physicianId,
            type,
            occurredAt: occurredIso,
            summary: summary.trim(),
            nextStep: nextStep.trim() || null,
          }).then((r) => r.json()),
        ),
      );
      const failed: Array<{ id: string; name: string; error: string }> = [];
      let okCount = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") okCount++;
        else {
          const p = providers.find((x) => x.id === ids[i]);
          failed.push({
            id: ids[i],
            name: p ? `${p.firstName} ${p.lastName}` : ids[i],
            error: r.reason instanceof Error ? r.reason.message : "Unknown error",
          });
        }
      });
      return { ok: okCount, failed };
    },
    onSuccess: ({ ok, failed }) => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0] as string | undefined;
        return typeof k === "string" && (k.startsWith("/api/interactions") || k.startsWith("/api/physicians") || k.startsWith("/api/provider-offices"));
      } });
      if (failed.length === 0) {
        toast({ title: `Interaction logged for ${ok} provider${ok === 1 ? "" : "s"}` });
        onOpenChange(false);
      } else {
        toast({
          title: `Logged ${ok}, failed ${failed.length}`,
          description: failed.map((f) => `${f.name}: ${f.error}`).join("\n"),
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Office visit failed", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = selected.size > 0 && summary.trim().length > 0 && !submit.isPending;

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [providers],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Log office visit
          </DialogTitle>
          <DialogDescription>
            One summary, fans out to every selected provider at <span className="font-medium text-foreground">{officeName}</span>.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            submit.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Providers seen ({selected.size}/{providers.length})</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={toggleAll}
                data-testid="button-office-visit-toggle-all"
              >
                {allChecked ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="border rounded-md max-h-[200px] overflow-y-auto divide-y">
              {sortedProviders.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No providers at this office.
                </p>
              ) : (
                sortedProviders.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover-elevate"
                    data-testid={`row-office-visit-provider-${p.id}`}
                  >
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleProvider(p.id)}
                      data-testid={`checkbox-office-visit-${p.id}`}
                    />
                    <span className="text-sm">
                      {p.lastName}, {p.firstName}{p.credentials ? `, ${p.credentials}` : ""}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="office-visit-type" className="text-sm">Type</Label>
              <select
                id="office-visit-type"
                value={type}
                onChange={(e) => setType(e.target.value as typeof TYPES[number])}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                data-testid="select-office-visit-type"
              >
                {TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="office-visit-occurred" className="text-sm">When</Label>
              <Input
                id="office-visit-occurred"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                required
                data-testid="input-office-visit-occurred"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="office-visit-summary" className="text-sm">Summary <span className="text-destructive">*</span></Label>
            <Textarea
              id="office-visit-summary"
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What happened? E.g., 'Dropped off lunch, talked about new evals being scheduled within 24 hrs'"
              rows={3}
              data-testid="input-office-visit-summary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="office-visit-next-step" className="text-sm">Next step (optional)</Label>
            <Textarea
              id="office-visit-next-step"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="Follow-up call, drop-off, schedule a lunch…"
              rows={2}
              data-testid="input-office-visit-next-step"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="button-office-visit-submit">
              {submit.isPending ? "Logging…" : `Log for ${selected.size} provider${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
