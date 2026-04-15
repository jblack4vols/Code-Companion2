import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, UserPlus, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import type { Physician, Location } from "@shared/schema";

interface ReferralsAddFormProps {
  open: boolean;
  locations: Location[] | undefined;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}

export function ReferralsAddForm({ open, locations, isPending, onOpenChange, onSubmit }: ReferralsAddFormProps) {
  const [physicianSearch, setPhysicianSearch] = useState("");
  const [physicianResults, setPhysicianResults] = useState<Physician[]>([]);
  const [selectedPhysician, setSelectedPhysician] = useState<Physician | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [newProvider, setNewProvider] = useState({ firstName: "", lastName: "", credentials: "", npi: "", practiceName: "", specialty: "" });
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(physicianSearch, 300);

  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      apiRequest("GET", `/api/physicians/search?q=${encodeURIComponent(debouncedSearch)}`)
        .then(r => r.json()).then((data: Physician[]) => { setPhysicianResults(data); setShowDropdown(true); })
        .catch(() => setPhysicianResults([]));
    } else { setPhysicianResults([]); setShowDropdown(false); }
  }, [debouncedSearch]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const reset = () => {
    setPhysicianSearch(""); setSelectedPhysician(null); setShowNewProvider(false);
    setNewProvider({ firstName: "", lastName: "", credentials: "", npi: "", practiceName: "", specialty: "" });
    setPhysicianResults([]); setShowDropdown(false);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const patientName = (fd.get("patientFullName") as string || "").trim();
    const parts = patientName.split(" ");
    const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : patientName.slice(0, 2).toUpperCase();
    const payload: Record<string, unknown> = { locationId: fd.get("locationId"), referralDate: fd.get("referralDate"), patientInitialsOrAnonId: initials || "XX", patientFullName: patientName || null, patientPhone: (fd.get("patientPhone") as string || "").trim() || null, patientDob: (fd.get("patientDob") as string || "").trim() || null, status: fd.get("status") || "RECEIVED", diagnosisCategory: (fd.get("diagnosisCategory") as string || "").trim() || null, referralSource: fd.get("referralSource") || null, discipline: fd.get("discipline") || null };
    if (selectedPhysician) { payload.physicianId = selectedPhysician.id; payload.referringProviderName = `${selectedPhysician.firstName} ${selectedPhysician.lastName}`; payload.referringProviderNpi = selectedPhysician.npi || null; }
    else if (showNewProvider && newProvider.firstName && newProvider.lastName) { payload.newPhysician = { ...newProvider }; }
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Referral</DialogTitle>
          <DialogDescription>Record a new patient referral</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Referring Doctor</Label>
            {selectedPhysician ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <Check className="w-4 h-4 text-chart-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid="text-selected-physician">
                    {selectedPhysician.lastName}, {selectedPhysician.firstName}{selectedPhysician.credentials ? `, ${selectedPhysician.credentials}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {[selectedPhysician.practiceName, selectedPhysician.npi ? `NPI: ${selectedPhysician.npi}` : null].filter(Boolean).join(" \u00b7 ") || "No practice info"}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => { setSelectedPhysician(null); setPhysicianSearch(""); }} data-testid="button-clear-physician">
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : showNewProvider ? (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">New Provider</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewProvider(false)} data-testid="button-cancel-new-provider"><X className="w-3 h-3 mr-1" />Cancel</Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">First Name *</Label><Input value={newProvider.firstName} onChange={(e) => setNewProvider(p => ({ ...p, firstName: e.target.value }))} placeholder="First" data-testid="input-new-provider-first" /></div>
                  <div className="space-y-1"><Label className="text-xs">Last Name *</Label><Input value={newProvider.lastName} onChange={(e) => setNewProvider(p => ({ ...p, lastName: e.target.value }))} placeholder="Last" data-testid="input-new-provider-last" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Credentials</Label><Input value={newProvider.credentials} onChange={(e) => setNewProvider(p => ({ ...p, credentials: e.target.value }))} placeholder="e.g. M.D." data-testid="input-new-provider-credentials" /></div>
                  <div className="space-y-1"><Label className="text-xs">NPI</Label><Input value={newProvider.npi} onChange={(e) => setNewProvider(p => ({ ...p, npi: e.target.value }))} placeholder="NPI #" data-testid="input-new-provider-npi" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Practice Name</Label><Input value={newProvider.practiceName} onChange={(e) => setNewProvider(p => ({ ...p, practiceName: e.target.value }))} placeholder="Practice" data-testid="input-new-provider-practice" /></div>
                  <div className="space-y-1"><Label className="text-xs">Specialty</Label><Input value={newProvider.specialty} onChange={(e) => setNewProvider(p => ({ ...p, specialty: e.target.value }))} placeholder="Specialty" data-testid="input-new-provider-specialty" /></div>
                </div>
              </div>
            ) : (
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input value={physicianSearch} onChange={(e) => setPhysicianSearch(e.target.value)} onFocus={() => { if (physicianResults.length > 0) setShowDropdown(true); }} placeholder="Search by name, NPI, or practice..." className="pl-9" data-testid="input-physician-search" />
                </div>
                {showDropdown && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {physicianResults.length > 0 ? physicianResults.map((p) => (
                      <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer" onClick={() => { setSelectedPhysician(p); setPhysicianSearch(""); setShowDropdown(false); }} data-testid={`option-physician-${p.id}`}>
                        <p className="font-medium">{p.lastName}, {p.firstName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                        <p className="text-[10px] text-muted-foreground">{[p.specialty, p.practiceName, p.npi ? `NPI: ${p.npi}` : null].filter(Boolean).join(" \u00b7 ")}</p>
                      </button>
                    )) : <div className="px-3 py-3 text-sm text-muted-foreground text-center">No referring providers found</div>}
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setShowNewProvider(true)} data-testid="button-add-new-provider">
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />Add New Provider
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Facility *</Label>
            <select name="locationId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-referral-location">
              <option value="">Select facility...</option>
              {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Created Date *</Label>
            <Input name="referralDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required data-testid="input-referral-date" />
          </div>
          <div className="space-y-1.5">
            <Label>Patient Name *</Label>
            <Input name="patientFullName" placeholder="e.g. JOHN DOE" required data-testid="input-referral-patient-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone Number</Label><Input name="patientPhone" type="tel" placeholder="(555) 555-1234" data-testid="input-referral-patient-phone" /></div>
            <div className="space-y-1.5"><Label>Date of Birth</Label><Input name="patientDob" type="date" data-testid="input-referral-patient-dob" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Discipline</Label>
              <select name="discipline" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-discipline-input">
                <option value="PT">PT</option><option value="OT">OT</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Referral Source</Label>
              <select name="referralSource" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-source">
                <option value="">-</option>
                <option value="Doctors Office">Doctor's Office</option>
                <option value="Former Patient">Former Patient</option>
                <option value="Direct Access">Direct Access</option>
                <option value="Walk-in">Walk-in</option>
                <option value="Google">Google</option>
                <option value="Insurance">Insurance</option>
                <option value="Friend">Friend</option>
                <option value="Employee">Employee</option>
                <option value="Other/Option not in list">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select name="status" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-status-input">
                <option value="RECEIVED">Received</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="EVAL_COMPLETED">Eval Completed</option>
                <option value="DISCHARGED">Discharged</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Diagnosis</Label><Input name="diagnosisCategory" placeholder="e.g. Post-Op" data-testid="input-referral-diagnosis" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-referral">{isPending ? "Adding..." : "Add Referral"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
