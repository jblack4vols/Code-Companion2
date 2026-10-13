/**
 * Cash Flow Scenario Editor — modal for creating/editing projection scenarios.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Scenario {
  id: number;
  name: string;
  weeklyVisits: number;
  rpv: number;
  laborPct: number;
  weeklyRent: number;
  weeklySupplies: number;
  weeklyOther: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario?: Scenario | null;
  onSaved: () => void;
}

const DEFAULTS = { name: "", weeklyVisits: "", rpv: "", laborPct: "", weeklyRent: "", weeklySupplies: "", weeklyOther: "" };

export function CashFlowScenarioEditor({ open, onOpenChange, scenario, onSaved }: Props) {
  const { toast } = useToast();
  const [fields, setFields] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFields(scenario ? {
        name: scenario.name,
        weeklyVisits: String(scenario.weeklyVisits),
        rpv: String(scenario.rpv),
        laborPct: String(scenario.laborPct),
        weeklyRent: String(scenario.weeklyRent),
        weeklySupplies: String(scenario.weeklySupplies),
        weeklyOther: String(scenario.weeklyOther),
      } : DEFAULTS);
    }
  }, [open, scenario]);

  const set = (key: keyof typeof DEFAULTS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(prev => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (!fields.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const requiredNumeric = ["weeklyVisits", "rpv", "laborPct"] as const;
    for (const key of requiredNumeric) {
      const val = fields[key];
      if (val === "" || isNaN(Number(val))) {
        toast({ title: `${key} must be a valid number`, variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: fields.name.trim(),
        weeklyVisits: Number(fields.weeklyVisits),
        rpv: Number(fields.rpv),
        laborPct: Number(fields.laborPct),
        weeklyRent: Number(fields.weeklyRent),
        weeklySupplies: Number(fields.weeklySupplies),
        weeklyOther: Number(fields.weeklyOther),
      };
      if (scenario) {
        await apiRequest("PATCH", `/api/cash-flow/scenarios/${scenario.id}`, payload);
      } else {
        await apiRequest("POST", "/api/cash-flow/scenarios", payload);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cash-flow/scenarios"] });
      onSaved();
      onOpenChange(false);
      toast({ title: scenario ? "Scenario updated" : "Scenario created" });
    } catch (err: unknown) {
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-scenario-editor">
        <DialogHeader>
          <DialogTitle>{scenario ? "Edit Scenario" : "New Scenario"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label htmlFor="cf-name">Name</Label><Input id="cf-name" value={fields.name} onChange={set("name")} data-testid="input-scenario-name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="cf-visits">Weekly Visits</Label><Input id="cf-visits" type="number" value={fields.weeklyVisits} onChange={set("weeklyVisits")} data-testid="input-weekly-visits" /></div>
            <div><Label htmlFor="cf-rpv">RPV ($)</Label><Input id="cf-rpv" type="number" value={fields.rpv} onChange={set("rpv")} data-testid="input-rpv" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="cf-labor">Labor %</Label><Input id="cf-labor" type="number" value={fields.laborPct} onChange={set("laborPct")} data-testid="input-labor-pct" /></div>
            <div><Label htmlFor="cf-rent">Weekly Rent ($)</Label><Input id="cf-rent" type="number" value={fields.weeklyRent} onChange={set("weeklyRent")} data-testid="input-weekly-rent" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="cf-supplies">Weekly Supplies ($)</Label><Input id="cf-supplies" type="number" value={fields.weeklySupplies} onChange={set("weeklySupplies")} data-testid="input-weekly-supplies" /></div>
            <div><Label htmlFor="cf-other">Weekly Other ($)</Label><Input id="cf-other" type="number" value={fields.weeklyOther} onChange={set("weeklyOther")} data-testid="input-weekly-other" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-scenario">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-scenario">{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
