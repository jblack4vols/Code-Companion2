import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LucideIcon } from "lucide-react";
import { Plus, Edit2, Trash2, FileText, Users, Phone, Mail, Calendar, Coffee, MoreHorizontal, Sparkles } from "lucide-react";
import type { InteractionTemplate } from "@shared/schema";

const INTERACTION_TYPES = ["VISIT", "CALL", "EMAIL", "EVENT", "LUNCH", "OTHER"] as const;

const typeBadgeStyles: Record<string, string> = {
  VISIT: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  CALL: "bg-green-500/15 text-green-700 dark:text-green-400",
  EMAIL: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  EVENT: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  LUNCH: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  OTHER: "bg-muted text-muted-foreground",
};

const typeIcons: Record<string, LucideIcon> = {
  VISIT: Users,
  CALL: Phone,
  EMAIL: Mail,
  EVENT: Calendar,
  LUNCH: Coffee,
  OTHER: MoreHorizontal,
};

const STARTER_TEMPLATES = [
  { name: "New Provider Introduction", type: "VISIT" as const, defaultSummary: "Initial visit to introduce our services and discuss potential referral partnership.", defaultNextStep: "Send follow-up materials and schedule second meeting" },
  { name: "Quarterly Check-in Call", type: "CALL" as const, defaultSummary: "Quarterly call to review referral volume, discuss patient outcomes, and address any concerns.", defaultNextStep: "Send quarterly summary report" },
  { name: "Referral Follow-up Email", type: "EMAIL" as const, defaultSummary: "Email follow-up regarding recent referrals and patient status updates.", defaultNextStep: null },
  { name: "Lunch & Learn", type: "LUNCH" as const, defaultSummary: "Educational lunch meeting covering our services and clinical outcomes data.", defaultNextStep: "Send presentation deck and schedule follow-up" },
  { name: "Conference Networking", type: "EVENT" as const, defaultSummary: "Met at industry conference, exchanged information and discussed collaboration opportunities.", defaultNextStep: "Send connection email within 48 hours" },
];

interface TemplateFormData {
  name: string;
  type: string;
  defaultSummary: string;
  defaultNextStep: string;
}

const emptyForm: TemplateFormData = { name: "", type: "VISIT", defaultSummary: "", defaultNextStep: "" };

export default function InteractionTemplatesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InteractionTemplate | null>(null);
  const [form, setForm] = useState<TemplateFormData>(emptyForm);

  const { data: templates, isLoading } = useQuery<InteractionTemplate[]>({
    queryKey: ["/api/interaction-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      const res = await apiRequest("POST", "/api/interaction-templates", {
        ...data,
        defaultNextStep: data.defaultNextStep || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interaction-templates"] });
      closeDialog();
      toast({ title: "Template created" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateFormData> }) => {
      const res = await apiRequest("PATCH", `/api/interaction-templates/${id}`, {
        ...data,
        defaultNextStep: data.defaultNextStep || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interaction-templates"] });
      closeDialog();
      toast({ title: "Template updated" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/interaction-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interaction-templates"] });
      toast({ title: "Template removed" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      for (const t of STARTER_TEMPLATES) {
        await apiRequest("POST", "/api/interaction-templates", t);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interaction-templates"] });
      toast({ title: "Starter templates created" });
    },
    onError: (err: unknown) => toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: InteractionTemplate) => {
    setEditingTemplate(t);
    setForm({
      name: t.name,
      type: t.type,
      defaultSummary: t.defaultSummary,
      defaultNextStep: t.defaultNextStep || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.type || !form.defaultSummary.trim()) return;

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-templates-title">Interaction Templates</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Reusable templates for interaction logging</p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-template">
          <Plus className="w-4 h-4 mr-2" />New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : !templates || templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-medium mb-1" data-testid="text-no-templates">No templates yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create templates to speed up interaction logging</p>
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-seed-templates"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {seedMutation.isPending ? "Creating..." : "Add Starter Templates"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => {
            const Icon = typeIcons[t.type] || typeIcons.OTHER;
            const badgeStyle = typeBadgeStyles[t.type] || typeBadgeStyles.OTHER;
            return (
              <Card key={t.id} data-testid={`card-template-${t.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate" data-testid={`text-template-name-${t.id}`}>
                      {t.name}
                    </span>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 text-[10px] ${badgeStyle}`} data-testid={`badge-template-type-${t.id}`}>
                    {t.type}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-template-summary-${t.id}`}>
                    {t.defaultSummary}
                  </p>
                  {t.defaultNextStep && (
                    <p className="text-xs text-muted-foreground/70 line-clamp-1" data-testid={`text-template-nextstep-${t.id}`}>
                      Next: {t.defaultNextStep}
                    </p>
                  )}
                  <div className="flex items-center gap-1 pt-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(t)}
                      aria-label={`Edit template ${t.name}`}
                      data-testid={`button-edit-template-${t.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(t.id)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete template ${t.name}`}
                      data-testid={`button-delete-template-${t.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingTemplate ? "Edit Template" : "New Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update the template details" : "Create a reusable template for interaction logging"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Name *</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. New Provider Introduction"
                required
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="select-template-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPES.map(t => (
                    <SelectItem key={t} value={t} data-testid={`select-item-type-${t}`}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-summary">Default Summary *</Label>
              <Textarea
                id="template-summary"
                value={form.defaultSummary}
                onChange={(e) => setForm(f => ({ ...f, defaultSummary: e.target.value }))}
                placeholder="Pre-filled summary text for interactions using this template"
                required
                data-testid="input-template-summary"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-nextstep">Default Next Step</Label>
              <Textarea
                id="template-nextstep"
                value={form.defaultNextStep}
                onChange={(e) => setForm(f => ({ ...f, defaultNextStep: e.target.value }))}
                placeholder="Optional suggested follow-up action"
                data-testid="input-template-nextstep"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel-template">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} data-testid="button-save-template">
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
