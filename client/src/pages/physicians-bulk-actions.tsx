import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { CheckSquare, ToggleLeft, Trash2, X } from "lucide-react";
import type { User } from "@shared/schema";

interface PhysiciansBulkActionsProps {
  selectedCount: number;
  users: User[] | undefined;
  isStatusPending: boolean;
  isAssignPending: boolean;
  isDeletePending: boolean;
  showBulkDelete: boolean;
  onSetStatus: (status: string) => void;
  onBulkAssign: (marketerId: string) => void;
  onShowBulkDelete: (open: boolean) => void;
  onConfirmDelete: () => void;
  onClearSelection: () => void;
}

export function PhysiciansBulkActions({
  selectedCount, users, isStatusPending, isAssignPending, isDeletePending,
  showBulkDelete, onSetStatus, onBulkAssign, onShowBulkDelete, onConfirmDelete, onClearSelection,
}: PhysiciansBulkActionsProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium" data-testid="text-selected-count">{selectedCount} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onSetStatus("ACTIVE")} disabled={isStatusPending} data-testid="button-bulk-activate">
              <ToggleLeft className="w-3.5 h-3.5 mr-1.5" />Set Active
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSetStatus("INACTIVE")} disabled={isStatusPending} data-testid="button-bulk-deactivate">
              <ToggleLeft className="w-3.5 h-3.5 mr-1.5" />Set Inactive
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSetStatus("PROSPECT")} disabled={isStatusPending} data-testid="button-bulk-prospect">
              Set Prospect
            </Button>
            <Select onValueChange={onBulkAssign} disabled={isAssignPending}>
              <SelectTrigger className="w-[180px]" data-testid="select-bulk-assign">
                <SelectValue placeholder="Assign Marketer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassign">Unassign</SelectItem>
                {users?.filter((u) => u.role === "OWNER" || u.role === "DIRECTOR" || u.role === "MARKETER").map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={showBulkDelete} onOpenChange={onShowBulkDelete}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-bulk-delete">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Referring Providers</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete {selectedCount} referring provider(s)? They will be removed from the active list. This action can be undone by an administrator.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="outline" onClick={() => onShowBulkDelete(false)} disabled={isDeletePending}>Cancel</Button>
                  <Button variant="destructive" onClick={onConfirmDelete} disabled={isDeletePending} data-testid="button-confirm-bulk-delete">
                    {isDeletePending ? "Deleting..." : `Delete ${selectedCount} Provider(s)`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Button variant="ghost" size="sm" onClick={onClearSelection} data-testid="button-clear-selection">
            <X className="w-3 h-3 mr-1" />Clear Selection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
