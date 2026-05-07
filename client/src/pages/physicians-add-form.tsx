import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";

interface PhysiciansAddFormProps {
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function PhysiciansAddForm({ open, isPending, onOpenChange, onSubmit }: PhysiciansAddFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-physician"><Plus className="w-4 h-4 mr-2" />Add Referring Provider</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Referring Provider</DialogTitle>
          <DialogDescription>Add a new referring provider to the directory</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="firstName">First Name *</Label><Input id="firstName" name="firstName" required data-testid="input-physician-first-name" /></div>
            <div className="space-y-1.5"><Label htmlFor="lastName">Last Name *</Label><Input id="lastName" name="lastName" required data-testid="input-physician-last-name" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="credentials">Credentials</Label><Input id="credentials" name="credentials" placeholder="M.D., DO, NP, etc." data-testid="input-physician-credentials" /></div>
            <div className="space-y-1.5"><Label htmlFor="npi">NPI</Label><Input id="npi" name="npi" placeholder="10-digit NPI" maxLength={10} data-testid="input-physician-npi" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="specialty">Specialty</Label><Input id="specialty" name="specialty" placeholder="Orthopedics" data-testid="input-physician-specialty" /></div>
            <div className="space-y-1.5"><Label htmlFor="practiceName">Office/Practice Name</Label><Input id="practiceName" name="practiceName" data-testid="input-physician-practice" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" data-testid="input-physician-phone" /></div>
            <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" data-testid="input-physician-email" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="city">City</Label><Input id="city" name="city" data-testid="input-physician-city" /></div>
            <div className="space-y-1.5"><Label htmlFor="state">State</Label><Input id="state" name="state" data-testid="input-physician-state" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select name="status" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-physician-status">
                <option value="PROSPECT">Prospect</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <select name="relationshipStage" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-physician-stage">
                <option value="NEW">New</option>
                <option value="DEVELOPING">Developing</option>
                <option value="STRONG">Strong</option>
                <option value="AT_RISK">At Risk</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select name="priority" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-physician-priority">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-physician">
              {isPending ? "Adding..." : "Add Referring Provider"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
