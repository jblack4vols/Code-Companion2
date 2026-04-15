/**
 * Owner-only bulk action buttons for the referrals page header:
 * delete selected, restore all, delete all.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, RotateCcw } from "lucide-react";

interface ReferralsBulkActionsProps {
  selectedCount: number;
  showDeleteConfirm: boolean;
  showRestoreAllConfirm: boolean;
  showDeleteAllConfirm: boolean;
  deleteAllConfirmText: string;
  isBulkDeletePending: boolean;
  isDeleteAllPending: boolean;
  isRestoreAllPending: boolean;
  onShowDeleteConfirm: (open: boolean) => void;
  onShowRestoreAllConfirm: (open: boolean) => void;
  onShowDeleteAllConfirm: (open: boolean) => void;
  onDeleteAllConfirmTextChange: (v: string) => void;
  onBulkDelete: () => void;
  onDeleteAll: () => void;
  onRestoreAll: () => void;
}

export function ReferralsBulkActions({
  selectedCount, showDeleteConfirm, showRestoreAllConfirm, showDeleteAllConfirm,
  deleteAllConfirmText, isBulkDeletePending, isDeleteAllPending, isRestoreAllPending,
  onShowDeleteConfirm, onShowRestoreAllConfirm, onShowDeleteAllConfirm,
  onDeleteAllConfirmTextChange, onBulkDelete, onDeleteAll, onRestoreAll,
}: ReferralsBulkActionsProps) {
  return (
    <>
      {selectedCount > 0 && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={onShowDeleteConfirm}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" data-testid="button-bulk-delete-referrals">
              <Trash2 className="w-3 h-3 mr-1.5" />Delete {selectedCount} Selected
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedCount} Referral{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently remove the selected referral records. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
                {isBulkDeletePending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <AlertDialog open={showRestoreAllConfirm} onOpenChange={onShowRestoreAllConfirm}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" data-testid="button-restore-all-referrals">
            <RotateCcw className="w-3 h-3 mr-1.5" />Restore All
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore All Deleted Referrals?</AlertDialogTitle>
            <AlertDialogDescription>This will restore all previously deleted referrals back to their original state.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore-all">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRestoreAll} data-testid="button-confirm-restore-all">
              {isRestoreAllPending ? "Restoring..." : "Restore All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showDeleteAllConfirm} onOpenChange={(open) => { onShowDeleteAllConfirm(open); if (!open) onDeleteAllConfirmTextChange(""); }}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" data-testid="button-delete-all-referrals">
            <Trash2 className="w-3 h-3 mr-1.5" />Delete All
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ALL Referrals?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete every referral in the system. You can restore them later using the "Restore All" button.{" "}
              Type <span className="font-mono font-bold">DELETE ALL</span> below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1">
            <Input placeholder="Type DELETE ALL to confirm" value={deleteAllConfirmText} onChange={(e) => onDeleteAllConfirmTextChange(e.target.value)} data-testid="input-delete-all-confirm" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all">Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteAllConfirmText !== "DELETE ALL" || isDeleteAllPending} onClick={onDeleteAll} data-testid="button-confirm-delete-all">
              {isDeleteAllPending ? "Deleting..." : "Delete All Referrals"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
