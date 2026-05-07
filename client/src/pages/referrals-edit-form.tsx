import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, X, Save, Loader2 } from "lucide-react";
import type { Physician, Location } from "@shared/schema";

type EditData = Record<string, string | number>;

interface ReferralsEditFormProps {
  editData: EditData;
  locations: Location[] | undefined;
  isPending: boolean;
  editPhysicianSearch: string;
  editPhysicianResults: Physician[];
  showEditPhysicianDropdown: boolean;
  editPhysicianSearchRef: React.RefObject<HTMLDivElement>;
  onEditDataChange: (data: EditData) => void;
  onEditPhysicianSearchChange: (v: string) => void;
  onEditPhysicianFocus: () => void;
  onSelectEditPhysician: (p: Physician) => void;
  onClearEditProvider: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function ReferralsEditForm({
  editData, locations, isPending, editPhysicianSearch, editPhysicianResults,
  showEditPhysicianDropdown, editPhysicianSearchRef, onEditDataChange,
  onEditPhysicianSearchChange, onEditPhysicianFocus, onSelectEditPhysician,
  onClearEditProvider, onSave, onCancel,
}: ReferralsEditFormProps) {
  const set = (k: string, v: string | number) => onEditDataChange({ ...editData, [k]: v });
  const s = editData as Record<string, string>;
  const n = editData as Record<string, number>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Patient Full Name</Label><Input value={s.patientFullName} onChange={(e) => set("patientFullName", e.target.value)} data-testid="edit-patient-name" /></div>
        <div className="space-y-1.5"><Label>Patient Phone</Label><Input value={s.patientPhone} onChange={(e) => set("patientPhone", e.target.value)} data-testid="edit-patient-phone" /></div>
        <div className="space-y-1.5"><Label>Patient DOB</Label><Input type="date" value={s.patientDob} onChange={(e) => set("patientDob", e.target.value)} data-testid="edit-patient-dob" /></div>
        <div className="space-y-1.5"><Label>Account #</Label><Input value={s.patientAccountNumber} onChange={(e) => set("patientAccountNumber", e.target.value)} data-testid="edit-account-number" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Referral Date</Label><Input type="date" value={s.referralDate} onChange={(e) => set("referralDate", e.target.value)} data-testid="edit-referral-date" /></div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={s.status} onChange={(e) => set("status", e.target.value)} data-testid="edit-status">
            <option value="RECEIVED">Received</option><option value="SCHEDULED">Scheduled</option>
            <option value="EVAL_COMPLETED">Eval Completed</option><option value="DISCHARGED">Discharged</option><option value="LOST">Lost</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Referring Provider</Label>
        <div ref={editPhysicianSearchRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={editPhysicianSearch} onChange={(e) => onEditPhysicianSearchChange(e.target.value)} onFocus={onEditPhysicianFocus} placeholder="Search by name or NPI..." className="pl-9" data-testid="edit-physician-search" />
          </div>
          {showEditPhysicianDropdown && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
              {editPhysicianResults.length > 0 ? editPhysicianResults.map((p) => (
                <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer" onClick={() => onSelectEditPhysician(p)} data-testid={`edit-option-physician-${p.id}`}>
                  <p className="font-medium">{p.lastName}, {p.firstName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                  <p className="text-[10px] text-muted-foreground">{[p.specialty, p.practiceName, p.npi ? `NPI: ${p.npi}` : null].filter(Boolean).join(" · ")}</p>
                </button>
              )) : <div className="px-3 py-3 text-sm text-muted-foreground text-center">No referring providers found</div>}
            </div>
          )}
          {s.referringProviderName ? (
            <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-md border bg-muted/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="edit-referring-provider">{s.referringProviderName}</p>
                {s.referringProviderNpi && <p className="text-[10px] text-muted-foreground font-mono" data-testid="edit-referring-npi">NPI: {s.referringProviderNpi}</p>}
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClearEditProvider} data-testid="button-clear-edit-provider"><X className="w-3 h-3" /></Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2 p-2 border rounded-md bg-muted/20">
              <p className="text-[10px] text-muted-foreground">Or enter manually:</p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Provider name" data-testid="edit-manual-provider-name" className="text-sm" onBlur={(e) => { if (e.target.value.trim()) set("referringProviderName", e.target.value.trim()); }} />
                <Input placeholder="NPI (optional)" data-testid="edit-manual-provider-npi" className="text-sm font-mono" maxLength={10} onBlur={(e) => { if (e.target.value.trim()) set("referringProviderNpi", e.target.value.trim()); }} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Facility</Label>
          <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={s.locationId} onChange={(e) => set("locationId", e.target.value)} data-testid="edit-location">
            <option value="">-</option>
            {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Discipline</Label>
          <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={s.discipline} onChange={(e) => set("discipline", e.target.value)} data-testid="edit-discipline">
            <option value="">-</option><option value="PT">PT</option><option value="OT">OT</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Referral Source</Label>
          <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={s.referralSource} onChange={(e) => set("referralSource", e.target.value)} data-testid="edit-referral-source">
            <option value="">-</option>
            <option value="Doctors Office">Doctor's Office</option><option value="Former Patient">Former Patient</option>
            <option value="Direct Access">Direct Access</option><option value="Walk-in">Walk-in</option>
            <option value="Google">Google</option><option value="Insurance">Insurance</option>
            <option value="Friend">Friend</option><option value="Employee">Employee</option>
            <option value="GoHighLevel">GoHighLevel</option><option value="Other/Option not in list">Other</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label>Diagnosis</Label><Input value={s.diagnosisCategory} onChange={(e) => set("diagnosisCategory", e.target.value)} data-testid="edit-diagnosis" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Case Title</Label><Input value={s.caseTitle} onChange={(e) => set("caseTitle", e.target.value)} data-testid="edit-case-title" /></div>
        <div className="space-y-1.5"><Label>Therapist</Label><Input value={s.caseTherapist} onChange={(e) => set("caseTherapist", e.target.value)} data-testid="edit-therapist" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Insurance</Label><Input value={s.primaryInsurance} onChange={(e) => set("primaryInsurance", e.target.value)} data-testid="edit-insurance" /></div>
        <div className="space-y-1.5"><Label>Payer Type</Label><Input value={s.primaryPayerType} onChange={(e) => set("primaryPayerType", e.target.value)} data-testid="edit-payer-type" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Initial Eval Date</Label><Input type="date" value={s.dateOfInitialEval} onChange={(e) => set("dateOfInitialEval", e.target.value)} data-testid="edit-initial-eval" /></div>
        <div className="space-y-1.5"><Label>Scheduled Visits</Label><Input type="number" value={n.scheduledVisits} onChange={(e) => set("scheduledVisits", parseInt(e.target.value) || 0)} data-testid="edit-scheduled-visits" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Arrived Visits</Label><Input type="number" value={n.arrivedVisits} onChange={(e) => set("arrivedVisits", parseInt(e.target.value) || 0)} data-testid="edit-arrived-visits" /></div>
        <div className="space-y-1.5"><Label>Discharge Date</Label><Input type="date" value={s.dischargeDate} onChange={(e) => set("dischargeDate", e.target.value)} data-testid="edit-discharge-date" /></div>
      </div>
      <div className="space-y-1.5"><Label>Discharge Reason</Label><Input value={s.dischargeReason} onChange={(e) => set("dischargeReason", e.target.value)} data-testid="edit-discharge-reason" /></div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-edit">Cancel</Button>
        <Button onClick={onSave} disabled={isPending} data-testid="button-save-edit">
          {isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
