import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Phone, Mail, MapPin, Calendar, MessageSquare, FileText, ClipboardList, Stethoscope, Plus, Edit2, Save, X, Building2, StickyNote, Trash2, Pencil, Send, ToggleLeft, GitBranch } from "lucide-react";
import { ProviderRelationshipTimeline } from "@/components/provider-relationship-timeline";
import { useAuth, hasPermission } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Physician, Interaction, Referral, Task, User, Location, PhysicianComment } from "@shared/schema";
import { format } from "date-fns";
import { useLocation, Link } from "wouter";

const stageBadge: Record<string, string> = {
  NEW: "bg-chart-1/15 text-chart-1",
  DEVELOPING: "bg-chart-3/15 text-chart-3",
  STRONG: "bg-chart-4/15 text-chart-4",
  AT_RISK: "bg-chart-5/15 text-chart-5",
};

const interactionTypeIcon: Record<string, string> = {
  VISIT: "bg-chart-1/15 text-chart-1",
  CALL: "bg-chart-2/15 text-chart-2",
  EMAIL: "bg-chart-3/15 text-chart-3",
  EVENT: "bg-chart-4/15 text-chart-4",
  LUNCH: "bg-chart-5/15 text-chart-5",
  OTHER: "bg-muted text-muted-foreground",
};

export default function PhysicianDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLoc] = useLocation();
  const [editing, setEditing] = useState(false);
  const [showInteraction, setShowInteraction] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [practiceNameValue, setPracticeNameValue] = useState("");
  const [linkingOffice, setLinkingOffice] = useState(false);
  const [linkOfficeName, setLinkOfficeName] = useState("");

  const { data: physician, isLoading } = useQuery<Physician>({
    queryKey: ["/api/physicians", params.id],
  });
  const { data: interactions } = useQuery<Interaction[]>({
    queryKey: [`/api/interactions?physicianId=${params.id}`],
    enabled: !!params.id,
  });
  const { data: referrals } = useQuery<Referral[]>({
    queryKey: [`/api/referrals?physicianId=${params.id}`],
    enabled: !!params.id,
  });
  const { data: tasks } = useQuery<Task[]>({
    queryKey: [`/api/tasks?physicianId=${params.id}`],
    enabled: !!params.id,
  });
  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: practiceNamesData } = useQuery<string[]>({
    queryKey: ["/api/physicians/practice-names"],
    enabled: editing || linkingOffice,
  });
  const { data: comments } = useQuery<PhysicianComment[]>({
    queryKey: ["/api/physicians", params.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/physicians/${params.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!params.id,
  });
  useEffect(() => {
    if (editing && physician) {
      setPracticeNameValue(physician.practiceName || "");
    }
  }, [editing, physician]);

  const { data: healthScore } = useQuery<{ healthScore: number } | null>({
    queryKey: ["/api/physicians", params.id, "health-score"],
    queryFn: async () => {
      const res = await fetch(`/api/physicians/${params.id}/health-score`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!params.id,
  });

  const canEdit = user ? hasPermission(user.role, "edit", "physician") : false;
  const canDelete = user ? (user.role === "OWNER" || user.role === "DIRECTOR") : false;
  const canDeleteComments = user ? (user.role === "OWNER" || user.role === "DIRECTOR") : false;

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/physicians/${params.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setEditing(false);
      toast({ title: "Referring provider updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const linkOfficeMutation = useMutation({
    mutationFn: async (practiceName: string) => {
      const res = await apiRequest("PATCH", `/api/physicians/${params.id}/link-office`, { practiceName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider-offices"] });
      setLinkingOffice(false);
      setLinkOfficeName("");
      toast({ title: "Office linked successfully" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addInteraction = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/interactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/interactions?physicianId=${params.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/interactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setShowInteraction(false);
      toast({ title: "Interaction logged" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/physicians/${params.id}/comments`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians", params.id, "comments"] });
      setNewComment("");
      toast({ title: "Comment added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      const res = await apiRequest("PATCH", `/api/physicians/${params.id}/comments/${commentId}`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians", params.id, "comments"] });
      setEditingCommentId(null);
      setEditingCommentContent("");
      toast({ title: "Comment updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await apiRequest("DELETE", `/api/physicians/${params.id}/comments/${commentId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians", params.id, "comments"] });
      toast({ title: "Comment deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/physicians/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });
      toast({ title: "Referring provider deleted" });
      setLoc("/physicians");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const setInactiveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/physicians/${params.id}`, { status: "INACTIVE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians/paginated"] });
      toast({ title: "Referring provider set to inactive" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addCommentMutation.mutate(newComment);
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      credentials: fd.get("credentials") || null,
      npi: fd.get("npi") || null,
      specialty: fd.get("specialty") || null,
      practiceName: practiceNameValue.trim() || null,
      phone: fd.get("phone") || null,
      email: fd.get("email") || null,
      city: fd.get("city") || null,
      state: fd.get("state") || null,
      status: fd.get("status"),
      relationshipStage: fd.get("relationshipStage"),
      priority: fd.get("priority"),
      notes: fd.get("notes") || null,
      assignedOwnerId: fd.get("assignedOwnerId") || null,
      referralSourceAttribution: fd.get("referralSourceAttribution") || null,
    });
  };

  const handleAddInteraction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addInteraction.mutate({
      physicianId: params.id,
      userId: user?.id,
      type: fd.get("type"),
      occurredAt: new Date(fd.get("occurredAt") as string).toISOString(),
      summary: fd.get("summary"),
      nextStep: fd.get("nextStep") || null,
      locationId: fd.get("locationId") || null,
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!physician) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <p className="text-muted-foreground">Referring provider not found</p>
        <Link href="/physicians"><Button variant="outline" className="mt-4">Back to Referring Providers</Button></Link>
      </div>
    );
  }

  const owner = users?.find(u => u.id === physician.assignedOwnerId);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/physicians">
          <Button variant="ghost" size="icon" aria-label="Back to referring providers" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-physician-name">{physician.firstName} {physician.lastName}{physician.credentials ? `, ${physician.credentials}` : ""}</h1>
          <div className="flex items-center gap-3 flex-wrap mt-0.5">
            <p className="page-subtitle">{[physician.specialty, physician.practiceName].filter(Boolean).join(" · ") || "No practice info"}</p>
            {physician.npi && (
              <Badge variant="secondary" className="text-[10px] font-mono" data-testid="badge-npi">NPI: {physician.npi}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {healthScore && typeof healthScore.healthScore === "number" && (
            <div className="flex items-center gap-1.5 mr-2" data-testid="health-score-badge">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                healthScore.healthScore >= 80 ? "bg-green-500" : healthScore.healthScore >= 50 ? "bg-yellow-500" : healthScore.healthScore >= 25 ? "bg-orange-500" : "bg-red-500"
              }`}>
                {Math.round(healthScore.healthScore)}
              </div>
              <span className="text-xs text-muted-foreground">Health</span>
            </div>
          )}
          <Badge variant="outline" className={stageBadge[physician.relationshipStage ?? "NEW"]}>
            {physician.relationshipStage?.replace("_", " ") ?? "—"}
          </Badge>
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => { setPracticeNameValue(physician?.practiceName || ""); setEditing(true); }} data-testid="button-edit-physician">
              <Edit2 className="w-3 h-3 mr-1.5" />Edit
            </Button>
          )}
          {canDelete && physician.status !== "INACTIVE" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInactiveMutation.mutate()}
              disabled={setInactiveMutation.isPending}
              data-testid="button-set-inactive-physician"
            >
              <ToggleLeft className="w-3 h-3 mr-1.5" />{setInactiveMutation.isPending ? "Saving..." : "Set Inactive"}
            </Button>
          )}
          {canDelete && (
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-delete-physician">
                  <Trash2 className="w-3 h-3 mr-1.5" />Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Referring Provider</DialogTitle>
                  <DialogDescription>This action will remove the referring provider from the active list</DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete <strong>Dr. {physician.firstName} {physician.lastName}</strong>? This will remove them from the active list. This action can be undone by an administrator.
                </p>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteMutation.isPending}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    data-testid="button-confirm-delete-physician"
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {editing ? (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First Name</Label>
                  <Input name="firstName" defaultValue={physician.firstName} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name</Label>
                  <Input name="lastName" defaultValue={physician.lastName} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Credentials</Label>
                  <Input name="credentials" defaultValue={physician.credentials || ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>NPI</Label>
                  <Input name="npi" defaultValue={physician.npi || ""} placeholder="10-digit NPI" maxLength={10} className="font-mono" data-testid="input-edit-npi" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Specialty</Label>
                  <Input name="specialty" defaultValue={physician.specialty || ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Office/Practice Name</Label>
                  <div className="relative">
                    <Input
                      value={practiceNameValue}
                      onChange={(e) => setPracticeNameValue(e.target.value)}
                      placeholder="Type or select a practice..."
                      list="practice-names-list"
                      data-testid="input-edit-practice-name"
                    />
                    <datalist id="practice-names-list">
                      {(practiceNamesData || []).map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input name="phone" defaultValue={physician.phone || ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input name="email" defaultValue={physician.email || ""} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input name="city" defaultValue={physician.city || ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input name="state" defaultValue={physician.state || ""} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <select name="status" defaultValue={physician.status} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="PROSPECT">Prospect</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Stage</Label>
                  <select name="relationshipStage" defaultValue={physician.relationshipStage} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="NEW">New</option>
                    <option value="DEVELOPING">Developing</option>
                    <option value="STRONG">Strong</option>
                    <option value="AT_RISK">At Risk</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <select name="priority" defaultValue={physician.priority} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Assigned Owner</Label>
                <select name="assignedOwnerId" defaultValue={physician.assignedOwnerId || ""} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Referral Source</Label>
                <select name="referralSourceAttribution" defaultValue={physician.referralSourceAttribution || ""} className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-referral-source">
                  <option value="">Not Specified</option>
                  <option value="WEBSITE">Website</option>
                  <option value="CONFERENCE">Conference</option>
                  <option value="COLD_CALL">Cold Call</option>
                  <option value="REFERRAL">Referral from Other MD</option>
                  <option value="MARKETING">Marketing Campaign</option>
                  <option value="EXISTING">Existing Relationship</option>
                  <option value="LUNCH_LEARN">Lunch & Learn</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea name="notes" defaultValue={physician.notes || ""} rows={4} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)}><X className="w-3 h-3 mr-1.5" />Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}><Save className="w-3 h-3 mr-1.5" />Save</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-semibold">Contact Info</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {physician.npi && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">NPI</span>
                  <span className="font-mono">{physician.npi}</span>
                </div>
              )}
              {physician.credentials && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Credentials</span>
                  <span>{physician.credentials}</span>
                </div>
              )}
              {physician.practiceName ? (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Office/Practice Name</span>
                  <Link href={`/physicians?practice=${encodeURIComponent(physician.practiceName)}`}>
                    <span className="hover:underline text-primary/80 cursor-pointer flex items-center gap-1" data-testid="link-practice-detail">
                      <Building2 className="w-3 h-3" />{physician.practiceName}
                    </span>
                  </Link>
                </div>
              ) : null}
              {linkingOffice ? (
                <div className="space-y-2 p-2 border rounded-md bg-muted/30">
                  <Label className="text-xs">Link to Office/Practice</Label>
                  <Input
                    value={linkOfficeName}
                    onChange={(e) => setLinkOfficeName(e.target.value)}
                    placeholder="Type practice name..."
                    list="link-practice-names-list"
                    data-testid="input-link-office"
                    className="text-sm"
                  />
                  <datalist id="link-practice-names-list">
                    {(practiceNamesData || []).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setLinkingOffice(false); setLinkOfficeName(""); }} data-testid="button-cancel-link-office"><X className="w-3 h-3 mr-1" />Cancel</Button>
                    <Button size="sm" disabled={!linkOfficeName.trim() || linkOfficeMutation.isPending} onClick={() => linkOfficeMutation.mutate(linkOfficeName.trim())} data-testid="button-save-link-office"><Save className="w-3 h-3 mr-1" />Save</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { setLinkOfficeName(physician.practiceName || ""); setLinkingOffice(true); }} data-testid="button-link-office">
                  <Building2 className="w-3 h-3 mr-1.5" />{physician.practiceName ? "Change Office" : "Link to Office"}
                </Button>
              )}
              <div className="pt-2 border-t" />
              {physician.phone && (
                <div className="flex items-center gap-2 text-sm"><Phone className="w-3.5 h-3.5 text-muted-foreground" />{physician.phone}</div>
              )}
              {physician.email && (
                <div className="flex items-center gap-2 text-sm"><Mail className="w-3.5 h-3.5 text-muted-foreground" />{physician.email}</div>
              )}
              {(physician.city || physician.state) && (
                <div className="flex items-center gap-2 text-sm"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{[physician.city, physician.state].filter(Boolean).join(", ")}</div>
              )}
              <div className="pt-2 border-t space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className="text-[10px]">{physician.status}</Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge variant="outline" className="text-[10px]">{physician.priority}</Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Owner</span>
                  <span>{owner?.name || "Unassigned"}</span>
                </div>
                {physician.referralSourceAttribution && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Referral Source</span>
                    <Badge variant="outline" className="text-[10px]" data-testid="badge-referral-source">{physician.referralSourceAttribution?.replace(/_/g, " ") ?? "—"}</Badge>
                  </div>
                )}
              </div>
              {physician.notes && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{physician.notes}</p>
                </div>
              )}
              {physician.customFields && Object.keys(physician.customFields).length > 0 && (
                <div className="pt-2 border-t space-y-1.5">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Custom Fields</p>
                  {Object.entries(physician.customFields).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-xs" data-testid={`custom-field-${key}`}>
                      <span className="text-muted-foreground">{key}</span>
                      <span className="text-right max-w-[60%] truncate">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <Tabs defaultValue="interactions" className="h-full">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <TabsList>
                    <TabsTrigger value="interactions" data-testid="tab-interactions">
                      <MessageSquare className="w-3.5 h-3.5 mr-1.5" />Interactions
                    </TabsTrigger>
                    <TabsTrigger value="referrals" data-testid="tab-referrals">
                      <FileText className="w-3.5 h-3.5 mr-1.5" />Referrals
                    </TabsTrigger>
                    <TabsTrigger value="tasks" data-testid="tab-tasks">
                      <ClipboardList className="w-3.5 h-3.5 mr-1.5" />Tasks
                    </TabsTrigger>
                    <TabsTrigger value="comments" data-testid="tab-comments">
                      <StickyNote className="w-3.5 h-3.5 mr-1.5" />Notes
                      {comments && comments.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{comments.length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="timeline" data-testid="tab-timeline">
                      <GitBranch className="w-3.5 h-3.5 mr-1.5" />Timeline
                    </TabsTrigger>
                  </TabsList>
                  {canEdit && (
                    <Dialog open={showInteraction} onOpenChange={setShowInteraction}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-log-interaction"><Plus className="w-3 h-3 mr-1" />Log Interaction</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Log Interaction</DialogTitle>
                          <DialogDescription>Record a new interaction with this referring provider</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleAddInteraction} className="space-y-4">
                          <div className="space-y-1.5">
                            <Label>Type</Label>
                            <select name="type" className="w-full rounded-md border bg-background px-3 py-2 text-sm" required data-testid="select-interaction-type">
                              <option value="VISIT">Visit</option>
                              <option value="CALL">Call</option>
                              <option value="EMAIL">Email</option>
                              <option value="EVENT">Event</option>
                              <option value="LUNCH">Lunch</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Date</Label>
                            <Input name="occurredAt" type="datetime-local" defaultValue={format(new Date(), "yyyy-MM-dd'T'HH:mm")} required data-testid="input-interaction-date" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Location</Label>
                            <select name="locationId" className="w-full rounded-md border bg-background px-3 py-2 text-sm" data-testid="select-interaction-location">
                              <option value="">None</option>
                              {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Summary</Label>
                            <Textarea name="summary" required placeholder="What happened?" data-testid="input-interaction-summary" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Next Step</Label>
                            <Input name="nextStep" placeholder="Optional" data-testid="input-interaction-nextstep" />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setShowInteraction(false)}>Cancel</Button>
                            <Button type="submit" disabled={addInteraction.isPending} data-testid="button-submit-interaction">
                              {addInteraction.isPending ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <TabsContent value="interactions" className="mt-0 space-y-2">
                  {interactions?.length ? interactions.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).map(i => (
                    <div key={i.id} className="flex gap-3 p-3 rounded-md border" data-testid={`card-interaction-${i.id}`}>
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${interactionTypeIcon[i.type]}`}>
                        {i.type[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{i.type}</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(i.occurredAt), "MMM d, yyyy h:mm a")}</span>
                        </div>
                        <p className="text-sm mt-1">{i.summary}</p>
                        {i.nextStep && <p className="text-xs text-muted-foreground mt-1">Next: {i.nextStep}</p>}
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No interactions logged yet
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="referrals" className="mt-0">
                  {referrals?.length ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground mb-3">{referrals.length} referral{referrals.length !== 1 ? "s" : ""}</p>
                      {[...referrals].sort((a, b) => (b.referralDate || "").localeCompare(a.referralDate || "")).map(r => (
                        <div key={r.id} className="flex items-start gap-3 p-3 rounded-md border" data-testid={`card-referral-${r.id}`}>
                          <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${r.status === "DISCHARGED" ? "bg-chart-4/15 text-chart-4" : "bg-chart-2/15 text-chart-2"}`}>R</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium" data-testid={`text-referral-patient-${r.id}`}>{r.patientFullName || r.patientInitialsOrAnonId || "Unknown"}</span>
                              <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                              {r.discipline && <Badge variant="outline" className="text-[10px]">{r.discipline}</Badge>}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              <span>{format(new Date(r.referralDate + "T00:00:00"), "MMM d, yyyy")}</span>
                              {r.patientAccountNumber && <span>Acct: {r.patientAccountNumber}</span>}
                              {r.diagnosisCategory && <span>{r.diagnosisCategory}</span>}
                              {r.caseTherapist && <span>Therapist: {r.caseTherapist}</span>}
                            </div>
                            {(r.scheduledVisits || r.arrivedVisits) && (
                              <p className="text-xs text-muted-foreground mt-0.5">Visits: {r.arrivedVisits || 0} arrived / {r.scheduledVisits || 0} scheduled</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No referrals yet
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="tasks" className="mt-0 space-y-2">
                  {tasks?.length ? tasks.map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`card-task-${t.id}`}>
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium ${t.status === "DONE" ? "bg-chart-4/15 text-chart-4" : "bg-chart-3/15 text-chart-3"}`}>
                        {t.status === "DONE" ? "D" : "O"}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{t.description}</p>
                        <p className="text-xs text-muted-foreground">Due {format(new Date(t.dueAt), "MMM d, yyyy")}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                    </div>
                  )) : (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No tasks
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="comments" className="mt-0 space-y-4">
                  <div className="flex gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add an internal note..."
                      className="text-sm resize-none"
                      rows={2}
                      data-testid="input-new-comment"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleAddComment();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                      aria-label="Post comment"
                      data-testid="button-add-comment"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  {comments?.length ? comments.map(c => {
                    const author = users?.find(u => u.id === c.userId);
                    const isOwn = user?.id === c.userId;
                    const isEditing = editingCommentId === c.id;
                    return (
                      <div key={c.id} className="p-3 rounded-md border space-y-1" data-testid={`card-comment-${c.id}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary text-[10px] font-medium">
                              {author?.name?.split(" ").map(n => n[0]).join("") || "?"}
                            </div>
                            <span className="text-sm font-medium">{author?.name || "Unknown"}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, yyyy h:mm a")}</span>
                            {c.updatedAt && new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000 && (
                              <span className="text-[10px] text-muted-foreground">(edited)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1" style={{ visibility: (isOwn || canDeleteComments) ? "visible" : "hidden" }}>
                            {isOwn && !isEditing && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setEditingCommentId(c.id); setEditingCommentContent(c.content); }}
                                aria-label="Edit comment"
                                data-testid={`button-edit-comment-${c.id}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            {canDeleteComments && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => deleteCommentMutation.mutate(c.id)}
                                disabled={deleteCommentMutation.isPending}
                                aria-label="Delete comment"
                                data-testid={`button-delete-comment-${c.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="flex gap-2 mt-1">
                            <Textarea
                              value={editingCommentContent}
                              onChange={(e) => setEditingCommentContent(e.target.value)}
                              className="text-sm resize-none"
                              rows={2}
                              data-testid={`input-edit-comment-${c.id}`}
                            />
                            <div className="flex flex-col gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => { updateCommentMutation.mutate({ commentId: c.id, content: editingCommentContent }); }}
                                disabled={!editingCommentContent.trim() || updateCommentMutation.isPending}
                                aria-label="Save comment"
                                data-testid={`button-save-comment-${c.id}`}
                              >
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => { setEditingCommentId(null); setEditingCommentContent(""); }} aria-label="Cancel comment edit" data-testid={`button-cancel-edit-${c.id}`}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap pl-8">{c.content}</p>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No notes yet. Add the first note above.
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="timeline" className="mt-0">
                  <ProviderRelationshipTimeline physicianId={params.id} />
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      )}

      {/* Mobile floating action: Log Interaction is the most-used action a
          field rep performs from this page; surface it within thumb reach.
          Hidden on md+ where the in-tab "Log Interaction" button is visible.
          Bottom offset clears the global MobileQuickActions bar (~5rem tall)
          plus the iOS notch via env(safe-area-inset-bottom). */}
      {physician && (
        <Button
          size="lg"
          onClick={() => setShowInteraction(true)}
          className="md:hidden fixed right-4 z-40 h-14 w-14 rounded-full shadow-lg p-0 bottom-[calc(5rem+env(safe-area-inset-bottom))]"
          aria-label="Log interaction"
          data-testid="fab-log-interaction"
        >
          <Plus className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}
