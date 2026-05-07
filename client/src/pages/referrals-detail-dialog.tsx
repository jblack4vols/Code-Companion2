import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { format } from "date-fns";
import type { Referral } from "@shared/schema";

type ReferralRow = Referral & {
  physicianFirstName?: string;
  physicianLastName?: string;
  physicianCredentials?: string;
  locationName?: string;
};

const statusBadge: Record<string, string> = {
  RECEIVED: "bg-chart-1/15 text-chart-1",
  SCHEDULED: "bg-chart-3/15 text-chart-3",
  EVAL_COMPLETED: "bg-chart-2/15 text-chart-2",
  DISCHARGED: "bg-chart-4/15 text-chart-4",
  LOST: "bg-chart-5/15 text-chart-5",
};

interface ReferralsDetailDialogProps {
  referral: ReferralRow | null;
  onClose: () => void;
  onEdit: (r: ReferralRow) => void;
  editContent?: React.ReactNode;
}

export function ReferralsDetailDialog({ referral, onClose, onEdit, editContent }: ReferralsDetailDialogProps) {
  const r = referral;

  return (
    <Dialog
      open={!!referral}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle data-testid="text-detail-title">
                {editContent ? "Edit Referral" : "Case Details"}
              </DialogTitle>
              <DialogDescription>{r?.patientAccountNumber || "Referral"}</DialogDescription>
            </div>
            {r && !editContent && (
              <Button variant="outline" size="sm" onClick={() => onEdit(r)} data-testid="button-edit-referral">
                <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        {editContent}

        {r && !editContent && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Patient</p>
                <p className="font-medium" data-testid="detail-patient-name">{r.patientFullName || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account #</p>
                <p className="font-mono">{r.patientAccountNumber || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created Date</p>
                <p>{format(new Date(r.referralDate + "T00:00:00"), "MM/dd/yyyy")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline" className={`text-[10px] ${statusBadge[r.status ?? "RECEIVED"]}`}>{r.status?.replace("_", " ") ?? "—"}</Badge>
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Referring Doctor</p>
                <p>{r.physicianFirstName ? `${r.physicianFirstName} ${r.physicianLastName}${r.physicianCredentials ? `, ${r.physicianCredentials}` : ""}` : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Referral Source</p>
                <p>{r.referralSource || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Facility</p>
                <p>{r.locationName || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Discipline</p>
                <p>{r.discipline || "-"}</p>
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Case Title</p>
                <p>{r.caseTitle || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Therapist</p>
                <p>{r.caseTherapist || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Diagnosis</p>
                <p>{r.diagnosisCategory || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Initial Eval</p>
                <p>{r.dateOfInitialEval ? format(new Date(r.dateOfInitialEval + "T00:00:00"), "MM/dd/yyyy") : "-"}</p>
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Scheduled Visits</p>
                <p>{r.scheduledVisits || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Arrived Visits</p>
                <p>{r.arrivedVisits || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">First Scheduled</p>
                <p>{r.dateOfFirstScheduledVisit ? format(new Date(r.dateOfFirstScheduledVisit + "T00:00:00"), "MM/dd/yyyy") : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">First Arrived</p>
                <p>{r.dateOfFirstArrivedVisit ? format(new Date(r.dateOfFirstArrivedVisit + "T00:00:00"), "MM/dd/yyyy") : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created to Arrived</p>
                <p>{r.createdToArrived != null ? `${r.createdToArrived} days` : "-"}</p>
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Insurance</p>
                <p>{r.primaryInsurance || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payer Type</p>
                <p>{r.primaryPayerType || "-"}</p>
              </div>
            </div>
            {r.dischargeDate && (
              <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Discharge Date</p>
                  <p>{format(new Date(r.dischargeDate + "T00:00:00"), "MM/dd/yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Discharge Reason</p>
                  <p>{r.dischargeReason || "-"}</p>
                </div>
              </div>
            )}
            {r.customFields && Object.keys(r.customFields).length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Custom Fields</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {Object.entries(r.customFields).map(([key, value]) => (
                    <div key={key} data-testid={`custom-field-${key}`}>
                      <p className="text-xs text-muted-foreground">{key}</p>
                      <p>{(value as string) || "-"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
