import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserPlus, AlertTriangle, Calendar, Clock, MapPin, Loader2, Activity, CheckCircle, XCircle, ListFilter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TRIAGE_COLORS: Record<string, string> = {
  RED: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-300",
  ORANGE: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300",
  YELLOW: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-300",
  GREEN: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-300",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  TRIAGED: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  SCHEDULED: "bg-green-500/15 text-green-700 dark:text-green-400",
  WAITLISTED: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  COMPLETED: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
  CANCELLED: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export default function FrontDeskPage() {
  const { toast } = useToast();
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [locationPreference, setLocationPreference] = useState("");

  const [triagePreview, setTriagePreview] = useState<{ level: string; notes: string } | null>(null);

  const { data: locations } = useQuery<any[]>({
    queryKey: ["/api/locations"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/frontdesk/stats"],
    queryFn: () => fetch("/api/frontdesk/stats", { credentials: "include" }).then(r => r.json()),
  });

  const requestsUrl = statusFilter === "all"
    ? "/api/frontdesk/requests"
    : `/api/frontdesk/requests?status=${statusFilter}`;

  const { data: requests, isLoading: requestsLoading } = useQuery<any[]>({
    queryKey: ["/api/frontdesk/requests", statusFilter],
    queryFn: () => fetch(requestsUrl, { credentials: "include" }).then(r => r.json()),
  });

  const { data: availableSlots } = useQuery<any[]>({
    queryKey: ["/api/frontdesk/slots", selectedRequest?.locationPreference],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedRequest?.locationPreference) params.set("locationId", selectedRequest.locationPreference);
      return fetch(`/api/frontdesk/slots?${params}`, { credentials: "include" }).then(r => r.json());
    },
    enabled: showScheduleDialog,
  });

  const triageMutation = useMutation({
    mutationFn: async (symptomsText: string) => {
      const res = await apiRequest("POST", "/api/frontdesk/triage", { symptoms: symptomsText });
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/frontdesk/requests", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/stats"] });
      setShowIntakeForm(false);
      resetForm();

      if (data.triage?.level === "RED") {
        toast({
          title: "EMERGENCY - Call 911",
          description: data.triage.notes,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Patient request created",
          description: `Triage: ${data.triage?.level} — ${data.triage?.notes}`,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data: { requestId: string; slotId: string }) => {
      const res = await apiRequest("POST", "/api/frontdesk/schedule", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/slots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/stats"] });
      setShowScheduleDialog(false);
      setSelectedRequest(null);
      toast({ title: "Appointment scheduled successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Scheduling failed", description: err.message, variant: "destructive" });
    },
  });

  const waitlistMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", "/api/frontdesk/waitlist", { requestId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/stats"] });
      toast({ title: "Patient added to waitlist" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("PATCH", `/api/frontdesk/requests/${requestId}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/frontdesk/stats"] });
      toast({ title: "Request cancelled" });
    },
  });

  function resetForm() {
    setPatientName("");
    setPhone("");
    setSymptoms("");
    setLocationPreference("");
    setTriagePreview(null);
  }

  async function handleTriagePreview() {
    if (!symptoms.trim()) return;
    const result = await triageMutation.mutateAsync(symptoms);
    setTriagePreview(result);
  }

  function handleSubmitIntake() {
    createMutation.mutate({
      patientName,
      phone,
      symptoms,
      locationPreference: locationPreference || null,
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-frontdesk-title">Front Desk Intake</h1>
          <p className="text-muted-foreground">AI-powered patient intake, triage, and scheduling</p>
        </div>
        <Button onClick={() => setShowIntakeForm(true)} data-testid="button-new-intake">
          <UserPlus className="w-4 h-4 mr-2" />
          New Patient Intake
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Activity className="w-4 h-4" />
                  <span>Today's Requests</span>
                </div>
                <div className="text-2xl font-bold" data-testid="text-total-requests">
                  {stats?.requests?.total || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Clock className="w-4 h-4" />
                  <span>Awaiting Triage</span>
                </div>
                <div className="text-2xl font-bold" data-testid="text-triaged-count">
                  {Number(stats?.requests?.triaged_count || 0) + Number(stats?.requests?.new_count || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>Scheduled</span>
                </div>
                <div className="text-2xl font-bold" data-testid="text-scheduled-count">
                  {stats?.requests?.scheduled_count || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <span>Available Slots</span>
                </div>
                <div className="text-2xl font-bold" data-testid="text-available-slots">
                  {stats?.slots?.available_slots || 0}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Patient Requests</CardTitle>
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="TRIAGED">Triaged</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="WAITLISTED">Waitlisted</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !requests || requests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No patient requests yet.</p>
              <p className="text-sm mt-1">Click "New Patient Intake" to start.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Symptoms</TableHead>
                  <TableHead>Triage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req: any) => (
                  <TableRow key={req.id} data-testid={`row-request-${req.id}`}>
                    <TableCell className="font-medium" data-testid={`text-patient-name-${req.id}`}>{req.patientName}</TableCell>
                    <TableCell>{req.phone}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={req.symptoms}>{req.symptoms}</TableCell>
                    <TableCell>
                      {req.triageLevel && (
                        <Badge className={TRIAGE_COLORS[req.triageLevel] || ""} data-testid={`badge-triage-${req.id}`}>
                          {req.triageLevel}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[req.status] || ""} data-testid={`badge-status-${req.id}`}>
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(req.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(req.status === "TRIAGED" || req.status === "NEW") && req.triageLevel !== "RED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedRequest(req); setShowScheduleDialog(true); }}
                            data-testid={`button-schedule-${req.id}`}
                          >
                            <Calendar className="w-3 h-3 mr-1" /> Schedule
                          </Button>
                        )}
                        {(req.status === "TRIAGED" || req.status === "NEW") && req.triageLevel !== "RED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => waitlistMutation.mutate(req.id)}
                            data-testid={`button-waitlist-${req.id}`}
                          >
                            Waitlist
                          </Button>
                        )}
                        {req.status !== "CANCELLED" && req.status !== "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => cancelMutation.mutate(req.id)}
                            data-testid={`button-cancel-${req.id}`}
                          >
                            <XCircle className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showIntakeForm} onOpenChange={setShowIntakeForm}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>New Patient Intake</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name</Label>
                <Input
                  id="patientName"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Full name"
                  data-testid="input-patient-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  data-testid="input-phone"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location Preference</Label>
              <Select value={locationPreference} onValueChange={setLocationPreference}>
                <SelectTrigger data-testid="select-location">
                  <SelectValue placeholder="Select location (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Location</SelectItem>
                  {locations?.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="symptoms">Symptoms / Reason for Visit</Label>
              <Textarea
                id="symptoms"
                value={symptoms}
                onChange={(e) => { setSymptoms(e.target.value); setTriagePreview(null); }}
                placeholder="Describe symptoms, pain location, duration, and any relevant history..."
                rows={4}
                data-testid="input-symptoms"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriagePreview}
                disabled={!symptoms.trim() || triageMutation.isPending}
                data-testid="button-preview-triage"
              >
                {triageMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Activity className="w-3 h-3 mr-1" />}
                Preview Triage
              </Button>
            </div>

            {triagePreview && (
              <Alert className={triagePreview.level === "RED" ? "border-red-500 bg-red-50 dark:bg-red-950/30" : ""}>
                {triagePreview.level === "RED" && <AlertTriangle className="h-4 w-4 text-red-600" />}
                <AlertTitle className="flex items-center gap-2">
                  <Badge className={TRIAGE_COLORS[triagePreview.level] || ""} data-testid="badge-triage-preview">
                    {triagePreview.level}
                  </Badge>
                  Triage Classification
                </AlertTitle>
                <AlertDescription data-testid="text-triage-notes">{triagePreview.notes}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowIntakeForm(false); resetForm(); }} data-testid="button-cancel-intake">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitIntake}
              disabled={!patientName || !phone || !symptoms || createMutation.isPending}
              data-testid="button-submit-intake"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Submit Intake
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleDialog} onOpenChange={(v) => { setShowScheduleDialog(v); if (!v) setSelectedRequest(null); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Schedule Appointment</DialogTitle>
            <CardDescription>
              {selectedRequest && (
                <span>
                  Scheduling for <strong>{selectedRequest.patientName}</strong>
                  {selectedRequest.triageLevel && (
                    <Badge className={`ml-2 ${TRIAGE_COLORS[selectedRequest.triageLevel] || ""}`}>
                      {selectedRequest.triageLevel}
                    </Badge>
                  )}
                </span>
              )}
            </CardDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[50vh]">
            {!availableSlots || availableSlots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No available slots found.</p>
                <p className="text-sm">Try expanding the search or add appointment slots.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableSlots.map((item: any) => (
                    <TableRow key={item.slot.id}>
                      <TableCell>{new Date(item.slot.date).toLocaleDateString()}</TableCell>
                      <TableCell>{item.slot.startTime} – {item.slot.endTime}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          {item.locationName || "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => scheduleMutation.mutate({ requestId: selectedRequest.id, slotId: item.slot.id })}
                          disabled={scheduleMutation.isPending}
                          data-testid={`button-book-slot-${item.slot.id}`}
                        >
                          {scheduleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Book"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedRequest) waitlistMutation.mutate(selectedRequest.id);
                setShowScheduleDialog(false);
                setSelectedRequest(null);
              }}
              data-testid="button-add-to-waitlist"
            >
              Add to Waitlist Instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
