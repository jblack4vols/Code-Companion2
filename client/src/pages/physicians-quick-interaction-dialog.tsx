import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Physician, Location } from "@shared/schema";

type PhysicianWithCount = Physician & { referralCount?: number };

interface PhysiciansQuickInteractionDialogProps {
  physician: PhysicianWithCount | null;
  locations: Location[] | undefined;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export function PhysiciansQuickInteractionDialog({ physician, locations, isPending, onClose, onSubmit }: PhysiciansQuickInteractionDialogProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSubmit({
      physicianId: physician?.id,
      type: fd.get("type"),
      summary: fd.get("summary") || "",
      nextStep: fd.get("nextStep") || "",
      occurredAt: fd.get("occurredAt") || new Date().toISOString().slice(0, 10),
      locationId: fd.get("locationId") || undefined,
    });
  };

  return (
    <Dialog open={!!physician} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Interaction</DialogTitle>
          <DialogDescription>
            Quick log for {physician?.firstName} {physician?.lastName}{physician?.credentials ? `, ${physician.credentials}` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <select name="type" required className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-quick-type">
                <option value="VISIT">Visit</option>
                <option value="CALL">Call</option>
                <option value="EMAIL">Email</option>
                <option value="LUNCH">Lunch</option>
                <option value="EVENT">Event</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} data-testid="input-quick-date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <select name="locationId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-quick-location">
              <option value="">Select location...</option>
              {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Summary</Label>
            <Textarea name="summary" placeholder="Brief description of the interaction..." rows={2} data-testid="input-quick-summary" />
          </div>
          <div className="space-y-1.5">
            <Label>Next Step</Label>
            <Input name="nextStep" placeholder="Follow-up action..." data-testid="input-quick-next-step" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-quick-interaction">
              {isPending ? "Logging..." : "Log Interaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
