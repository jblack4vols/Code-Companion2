import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Phone, Mail, Users, Coffee, Search, Check, ArrowRight, X, FileText, MapPin, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import type { Physician, Location, InteractionTemplate } from "@shared/schema";
import { format } from "date-fns";

const INTERACTION_TYPES = [
  { value: "VISIT", label: "Visit", icon: Users },
  { value: "CALL", label: "Call", icon: Phone },
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "LUNCH", label: "Lunch", icon: Coffee },
] as const;

const typeColors: Record<string, string> = {
  VISIT: "bg-chart-1 text-white",
  CALL: "bg-chart-2 text-white",
  EMAIL: "bg-chart-3 text-white",
  LUNCH: "bg-chart-5 text-white",
};

const typeColorsInactive: Record<string, string> = {
  VISIT: "bg-chart-1/10 text-chart-1",
  CALL: "bg-chart-2/10 text-chart-2",
  EMAIL: "bg-chart-3/10 text-chart-3",
  LUNCH: "bg-chart-5/10 text-chart-5",
};

export default function QuickLogPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [physicianSearch, setPhysicianSearch] = useState("");
  const [selectedPhysician, setSelectedPhysician] = useState<Physician | null>(null);
  const [interactionType, setInteractionType] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [addFollowUp, setAddFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpDescription, setFollowUpDescription] = useState("");
  const [locationId, setLocationId] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: physicians } = useQuery<Physician[]>({ queryKey: ["/api/physicians"] });
  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const { data: templates } = useQuery<InteractionTemplate[]>({ queryKey: ["/api/interaction-templates"] });

  const filteredPhysicians = useMemo(() => {
    if (!physicians || !physicianSearch.trim()) return [];
    const q = physicianSearch.toLowerCase();
    return physicians
      .filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        (p.practiceName && p.practiceName.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [physicians, physicianSearch]);

  const matchingTemplates = useMemo(() => {
    if (!templates || !interactionType) return [];
    return templates.filter(t => t.type === interactionType && t.isActive);
  }, [templates, interactionType]);

  const interactionMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/interactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const taskMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (err: unknown) => toast({ title: "Error creating follow-up", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const handleSubmit = async () => {
    if (!selectedPhysician || !interactionType || !summary.trim() || !user) return;

    try {
      await interactionMutation.mutateAsync({
        physicianId: selectedPhysician.id,
        userId: user.id,
        type: interactionType,
        occurredAt: new Date().toISOString(),
        summary: summary.trim(),
        nextStep: nextStep.trim() || null,
        followUpDueAt: addFollowUp && followUpDate ? new Date(followUpDate).toISOString() : null,
        locationId: locationId && locationId !== "none" ? locationId : null,
        skipAutoTask: addFollowUp && followUpDate && followUpDescription.trim() ? true : undefined,
      });

      if (addFollowUp && followUpDate && followUpDescription.trim()) {
        await taskMutation.mutateAsync({
          physicianId: selectedPhysician.id,
          assignedToUserId: user.id,
          description: followUpDescription.trim(),
          dueAt: new Date(followUpDate).toISOString(),
          priority: "MEDIUM",
        });
      }

      setSubmitted(true);
    } catch {
    }
  };

  const resetForm = () => {
    setPhysicianSearch("");
    setSelectedPhysician(null);
    setInteractionType("");
    setSummary("");
    setNextStep("");
    setAddFollowUp(false);
    setFollowUpDate("");
    setFollowUpDescription("");
    setLocationId("");
    setSubmitted(false);
  };

  const applyTemplate = (template: InteractionTemplate) => {
    setSummary(template.defaultSummary);
    if (template.defaultNextStep) {
      setNextStep(template.defaultNextStep);
    }
  };

  const isValid = selectedPhysician && interactionType && summary.trim();
  const isPending = interactionMutation.isPending || taskMutation.isPending;

  if (submitted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] mx-auto text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-success-title">Interaction Logged</h2>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-success-physician">
              {selectedPhysician ? `Dr. ${selectedPhysician.firstName} ${selectedPhysician.lastName}` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              className="min-h-[44px] w-full"
              onClick={resetForm}
              data-testid="button-log-another"
            >
              Log Another
            </Button>
            {selectedPhysician && (
              <Button
                variant="outline"
                className="min-h-[44px] w-full"
                onClick={() => setLocation(`/physicians/${selectedPhysician.id}`)}
                data-testid="button-view-provider"
              >
                View Provider <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-8">
      <div className="w-full max-w-[480px] mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-quick-log-title">Quick Log</h1>
          <p className="text-sm text-muted-foreground">Log an interaction from the field</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Provider</Label>
          {selectedPhysician ? (
            <Card data-testid="card-selected-physician">
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    Dr. {selectedPhysician.firstName} {selectedPhysician.lastName}
                  </p>
                  {selectedPhysician.practiceName && (
                    <p className="text-xs text-muted-foreground truncate">{selectedPhysician.practiceName}</p>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => { setSelectedPhysician(null); setPhysicianSearch(""); }}
                  aria-label="Clear selected provider"
                  data-testid="button-clear-physician"
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search providers..."
                  value={physicianSearch}
                  onChange={(e) => setPhysicianSearch(e.target.value)}
                  className="pl-9 min-h-[44px] text-base"
                  data-testid="input-physician-search"
                />
              </div>
              {filteredPhysicians.length > 0 && (
                <div className="space-y-1.5" data-testid="list-physician-results">
                  {filteredPhysicians.map(p => (
                    <Card
                      key={p.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => { setSelectedPhysician(p); setPhysicianSearch(""); }}
                      data-testid={`card-physician-${p.id}`}
                    >
                      <CardContent className="p-3 min-h-[44px] flex items-center">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            Dr. {p.firstName} {p.lastName}
                          </p>
                          {p.practiceName && (
                            <p className="text-xs text-muted-foreground truncate">{p.practiceName}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Interaction Type</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INTERACTION_TYPES.map(t => {
              const Icon = t.icon;
              const isSelected = interactionType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setInteractionType(t.value)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-md min-h-[44px] p-3 transition-colors ${
                    isSelected ? typeColors[t.value] : typeColorsInactive[t.value]
                  }`}
                  data-testid={`button-type-${t.value.toLowerCase()}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {matchingTemplates.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Templates</Label>
            <div className="flex flex-col gap-1.5">
              {matchingTemplates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center gap-2 rounded-md border p-3 min-h-[44px] text-left hover-elevate"
                  data-testid={`button-template-${t.id}`}
                >
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Summary *</Label>
          <Textarea
            placeholder="What happened during the interaction?"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="min-h-[100px] text-base"
            data-testid="textarea-summary"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Next Step</Label>
          <Textarea
            placeholder="Optional next step..."
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            className="min-h-[60px] text-base"
            data-testid="textarea-next-step"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between min-h-[44px]">
            <Label htmlFor="follow-up-toggle" className="text-sm font-medium cursor-pointer">
              Add Follow-up Task?
            </Label>
            <Switch
              id="follow-up-toggle"
              checked={addFollowUp}
              onCheckedChange={setAddFollowUp}
              data-testid="switch-follow-up"
            />
          </div>
          {addFollowUp && (
            <div className="space-y-3 pl-1">
              <div className="space-y-2">
                <Label className="text-sm">Follow-up Date</Label>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="min-h-[44px] text-base"
                  min={format(new Date(), "yyyy-MM-dd")}
                  data-testid="input-follow-up-date"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Follow-up Description</Label>
                <Textarea
                  placeholder="What needs to be done?"
                  value={followUpDescription}
                  onChange={(e) => setFollowUpDescription(e.target.value)}
                  className="min-h-[60px] text-base"
                  data-testid="textarea-follow-up-description"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Location</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="min-h-[44px] text-base" data-testid="select-location">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <SelectValue placeholder="Select location (optional)" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No location</SelectItem>
              {locations?.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full min-h-[48px] text-base font-semibold"
          disabled={!isValid || isPending}
          onClick={handleSubmit}
          data-testid="button-submit-interaction"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Log Interaction"
          )}
        </Button>
      </div>
    </div>
  );
}
