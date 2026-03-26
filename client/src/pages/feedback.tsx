import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Lightbulb, Bug, ArrowUpCircle, HelpCircle, Plus, MessageSquare,
  ChevronRight, Filter, Search, X, Send, Pencil, Trash2,
  Paperclip, FileText, Image, Video, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  FEATURE_IDEA: { label: "Feature Idea", icon: Lightbulb, color: "bg-chart-2/15 text-chart-2" },
  BUG: { label: "Bug / Issue", icon: Bug, color: "bg-red-500/15 text-red-500" },
  IMPROVEMENT: { label: "Improvement", icon: ArrowUpCircle, color: "bg-chart-1/15 text-chart-1" },
  OTHER: { label: "Other", icon: HelpCircle, color: "bg-chart-4/15 text-chart-4" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  LOW: { label: "Low", color: "bg-muted text-muted-foreground" },
  MEDIUM: { label: "Medium", color: "bg-chart-3/15 text-chart-3" },
  HIGH: { label: "High", color: "bg-orange-500/15 text-orange-500" },
  CRITICAL: { label: "Critical", color: "bg-red-500/15 text-red-500" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "bg-chart-1/15 text-chart-1" },
  IN_REVIEW: { label: "In Review", color: "bg-chart-4/15 text-chart-4" },
  PLANNED: { label: "Planned", color: "bg-chart-2/15 text-chart-2" },
  IN_PROGRESS: { label: "In Progress", color: "bg-chart-3/15 text-chart-3" },
  COMPLETED: { label: "Completed", color: "bg-green-500/15 text-green-500" },
  CLOSED: { label: "Closed", color: "bg-muted text-muted-foreground" },
};

type Attachment = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
};

type FeedbackItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  attachments: Attachment[] | null;
  submittedBy: string;
  submittedByName: string;
  assignedTo: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
};

type FeedbackNote = {
  id: string;
  content: string;
  userId: string;
  userName: string;
  createdAt: string;
};

type FeedbackDetail = FeedbackItem & { notes: FeedbackNote[] };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("video/")) return Video;
  return FileText;
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const url = `/api/feedback/attachments/${attachment.filename}`;
  const FileIcon = getFileIcon(attachment.mimeType);

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`attachment-${attachment.filename}`}>
      {attachment.mimeType.startsWith("image/") ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={attachment.originalName} className="w-full max-h-48 object-cover" />
        </a>
      ) : attachment.mimeType.startsWith("video/") ? (
        <video src={url} controls className="w-full max-h-48" />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors"
        >
          <FileIcon className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{attachment.originalName}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
          </div>
          <Download className="w-4 h-4 text-muted-foreground shrink-0" />
        </a>
      )}
      {(attachment.mimeType.startsWith("image/") || attachment.mimeType.startsWith("video/")) && (
        <div className="px-2 py-1 bg-muted/30 flex items-center justify-between">
          <span className="text-xs truncate">{attachment.originalName}</span>
          <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatFileSize(attachment.size)}</span>
        </div>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("FEATURE_IDEA");
  const [newPriority, setNewPriority] = useState("MEDIUM");
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");

  const [noteContent, setNoteContent] = useState("");

  const isManager = user?.role === "OWNER" || user?.role === "DIRECTOR";

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/feedback"],
  });

  const { data: detail, isLoading: detailLoading } = useQuery<FeedbackDetail>({
    queryKey: ["/api/feedback", detailId],
    enabled: !!detailId,
  });

  const { data: allUsers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/users"],
    enabled: isManager,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; category: string; priority: string; files: File[] }) => {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("description", data.description);
      formData.append("category", data.category);
      formData.append("priority", data.priority);
      data.files.forEach((file) => formData.append("files", file));

      let csrfToken: string | null = null;
      const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
      csrfToken = match ? decodeURIComponent(match[1]) : null;
      if (!csrfToken) {
        try {
          const csrfRes = await fetch("/api/csrf-token", { credentials: "include" });
          if (csrfRes.ok) {
            const csrfData = await csrfRes.json();
            csrfToken = csrfData.token;
          }
        } catch {}
      }

      const headers: Record<string, string> = {};
      if (csrfToken) headers["x-csrf-token"] = csrfToken;

      const res = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to submit" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewCategory("FEATURE_IDEA");
      setNewPriority("MEDIUM");
      setNewFiles([]);
      toast({ title: "Submitted successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/feedback/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/feedback", detailId] });
      setEditOpen(false);
      toast({ title: "Updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/feedback/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setDeleteId(null);
      if (detailId === deleteId) setDetailId(null);
      toast({ title: "Deleted successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await apiRequest("POST", `/api/feedback/${id}/notes`, { content });
      return res.json();
    },
    onSuccess: () => {
      if (detailId) queryClient.invalidateQueries({ queryKey: ["/api/feedback", detailId] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setNoteContent("");
      toast({ title: "Note added" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = items.filter((item) => {
    if (activeTab === "ideas" && item.category !== "FEATURE_IDEA") return false;
    if (activeTab === "issues" && item.category !== "BUG") return false;
    if (activeTab === "mine" && item.submittedBy !== user?.id) return false;
    if (filterCategory !== "all" && item.category !== filterCategory) return false;
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    }
    return true;
  });

  const openEdit = (item: FeedbackItem) => {
    setEditingItemId(item.id);
    setEditTitle(item.title);
    setEditDesc(item.description);
    setEditCategory(item.category);
    setEditPriority(item.priority);
    setEditStatus(item.status);
    setEditAssignedTo(item.assignedTo || "");
    setEditOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime", "application/pdf"];
    const maxSize = 25 * 1024 * 1024;

    const validFiles = files.filter((f) => {
      if (!validTypes.includes(f.type)) {
        toast({ title: "Invalid file type", description: `${f.name} is not supported. Use images, videos, or PDFs.`, variant: "destructive" });
        return false;
      }
      if (f.size > maxSize) {
        toast({ title: "File too large", description: `${f.name} exceeds the 25MB limit.`, variant: "destructive" });
        return false;
      }
      return true;
    });

    const total = newFiles.length + validFiles.length;
    if (total > 5) {
      toast({ title: "Too many files", description: "Maximum 5 attachments per submission.", variant: "destructive" });
      return;
    }

    setNewFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryCounts = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="feedback-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Feedback, Ideas & Support</h1>
          <p className="text-muted-foreground text-sm">Submit feature ideas, report issues, request support, and track progress</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-feedback">
          <Plus className="w-4 h-4 mr-2" />
          New Submission
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(statusConfig).slice(0, 4).map(([key, config]) => (
          <Card key={key} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setFilterStatus(key); setActiveTab("all"); }} data-testid={`card-status-${key.toLowerCase()}`}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{statusCounts[key] || 0}</div>
              <div className="text-xs text-muted-foreground">{config.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setFilterCategory("all"); setFilterStatus("all"); }} data-testid="tabs-feedback">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All ({items.length})</TabsTrigger>
            <TabsTrigger value="ideas" data-testid="tab-ideas">
              <Lightbulb className="w-3.5 h-3.5 mr-1" />Ideas ({categoryCounts["FEATURE_IDEA"] || 0})
            </TabsTrigger>
            <TabsTrigger value="issues" data-testid="tab-issues">
              <Bug className="w-3.5 h-3.5 mr-1" />Issues ({categoryCounts["BUG"] || 0})
            </TabsTrigger>
            <TabsTrigger value="mine" data-testid="tab-mine">My Submissions</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-48"
                data-testid="input-search"
              />
            </div>
            {activeTab === "all" && (
              <>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-36" data-testid="select-filter-category">
                    <Filter className="w-3.5 h-3.5 mr-1" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(categoryConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36" data-testid="select-filter-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {(filterCategory !== "all" || filterStatus !== "all" || searchQuery) && (
              <Button variant="ghost" size="icon" onClick={() => { setFilterCategory("all"); setFilterStatus("all"); setSearchQuery(""); }} data-testid="button-clear-filters">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No items found</p>
              <p className="text-sm mt-1">Try adjusting your filters or submit a new idea</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => {
                const cat = categoryConfig[item.category] || categoryConfig.OTHER;
                const CatIcon = cat.icon;
                const pri = priorityConfig[item.priority] || priorityConfig.MEDIUM;
                const stat = statusConfig[item.status] || statusConfig.OPEN;
                const canModify = isManager || item.submittedBy === user?.id;
                const attachmentCount = (item.attachments || []).length;

                return (
                  <Card
                    key={item.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setDetailId(item.id)}
                    data-testid={`card-feedback-${item.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${cat.color}`}>
                          <CatIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium truncate" data-testid={`text-title-${item.id}`}>{item.title}</h3>
                            <Badge variant="outline" className={`text-[10px] ${stat.color}`}>{stat.label}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${pri.color}`}>{pri.label}</Badge>
                            {attachmentCount > 0 && (
                              <Badge variant="outline" className="text-[10px] bg-muted">
                                <Paperclip className="w-3 h-3 mr-0.5" />{attachmentCount}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{item.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>by {item.submittedByName}</span>
                            <span>{format(new Date(item.createdAt), "MMM d, yyyy")}</span>
                            {item.assignedToName && <span>Assigned: {item.assignedToName}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canModify && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                                data-testid={`button-edit-${item.id}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }}
                                data-testid={`button-delete-${item.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setNewFiles([]); } setCreateOpen(open); }}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-create-feedback">
          <DialogHeader>
            <DialogTitle>New Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger data-testid="select-new-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Brief summary..."
                data-testid="input-new-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Describe the feature idea or issue in detail..."
                rows={4}
                data-testid="input-new-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger data-testid="select-new-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Attachments</label>
              <p className="text-xs text-muted-foreground mb-2">Upload images, videos, or PDFs (max 5 files, 25MB each)</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file-upload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={newFiles.length >= 5}
                data-testid="button-attach-files"
              >
                <Paperclip className="w-4 h-4 mr-2" />
                Attach Files
              </Button>
              {newFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {newFiles.map((file, idx) => {
                    const FileIcon = getFileIcon(file.type);
                    return (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1.5" data-testid={`file-preview-${idx}`}>
                        <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => removeFile(idx)}
                          data-testid={`button-remove-file-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setNewFiles([]); }} data-testid="button-cancel-create">Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({ title: newTitle, description: newDesc, category: newCategory, priority: newPriority, files: newFiles })}
              disabled={!newTitle.trim() || !newDesc.trim() || createMutation.isPending}
              data-testid="button-submit-feedback"
            >
              {createMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" data-testid="dialog-detail-feedback">
          {detailLoading || !detail ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {(() => {
                    const cat = categoryConfig[detail.category] || categoryConfig.OTHER;
                    const CatIcon = cat.icon;
                    return <div className={`p-2 rounded-lg ${cat.color}`}><CatIcon className="w-4 h-4" /></div>;
                  })()}
                  <DialogTitle className="text-lg" data-testid="text-detail-title">{detail.title}</DialogTitle>
                </div>
              </DialogHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={statusConfig[detail.status]?.color}>{statusConfig[detail.status]?.label}</Badge>
                    <Badge variant="outline" className={priorityConfig[detail.priority]?.color}>{priorityConfig[detail.priority]?.label}</Badge>
                    <Badge variant="outline" className={categoryConfig[detail.category]?.color}>{categoryConfig[detail.category]?.label}</Badge>
                  </div>
                  <p className="text-sm leading-relaxed" data-testid="text-detail-description">{detail.description}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Submitted by:</span> {detail.submittedByName}</div>
                    <div><span className="text-muted-foreground">Created:</span> {format(new Date(detail.createdAt), "MMM d, yyyy h:mm a")}</div>
                    {detail.assignedToName && <div><span className="text-muted-foreground">Assigned to:</span> {detail.assignedToName}</div>}
                    <div><span className="text-muted-foreground">Updated:</span> {format(new Date(detail.updatedAt), "MMM d, yyyy h:mm a")}</div>
                  </div>

                  {detail.attachments && detail.attachments.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm flex items-center gap-1 mb-2">
                        <Paperclip className="w-4 h-4" /> Attachments ({detail.attachments.length})
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {detail.attachments.map((att, idx) => (
                          <AttachmentPreview key={idx} attachment={att} />
                        ))}
                      </div>
                    </div>
                  )}

                  {isManager && (
                    <div className="flex gap-2 flex-wrap">
                      <Select
                        value={detail.status}
                        onValueChange={(val) => updateMutation.mutate({ id: detail.id, data: { status: val } })}
                      >
                        <SelectTrigger className="w-36" data-testid="select-detail-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key}>{config.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={detail.assignedTo || "unassigned"}
                        onValueChange={(val) => updateMutation.mutate({ id: detail.id, data: { assignedTo: val === "unassigned" ? null : val } })}
                      >
                        <SelectTrigger className="w-44" data-testid="select-detail-assignee">
                          <SelectValue placeholder="Assign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {allUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Separator />

                  <div>
                    <h4 className="font-medium text-sm flex items-center gap-1 mb-3">
                      <MessageSquare className="w-4 h-4" /> Notes & Updates ({detail.notes.length})
                    </h4>
                    {detail.notes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No notes yet. Be the first to add one.</p>
                    ) : (
                      <div className="space-y-3">
                        {detail.notes.map((note) => (
                          <div key={note.id} className="bg-muted/50 rounded-lg p-3" data-testid={`note-${note.id}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{note.userName}</span>
                              <span className="text-xs text-muted-foreground">{format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}</span>
                            </div>
                            <p className="text-sm">{note.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Textarea
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Add a note or update..."
                        rows={2}
                        className="flex-1"
                        data-testid="input-note-content"
                      />
                      <Button
                        size="icon"
                        className="shrink-0 self-end"
                        disabled={!noteContent.trim() || addNoteMutation.isPending}
                        onClick={() => addNoteMutation.mutate({ id: detail.id, content: noteContent })}
                        data-testid="button-add-note"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-edit-feedback">
          <DialogHeader>
            <DialogTitle>Edit Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger data-testid="select-edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} data-testid="input-edit-title" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} data-testid="input-edit-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger data-testid="select-edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} data-testid="button-cancel-edit">Cancel</Button>
            <Button
              onClick={() => {
                if (editingItemId) {
                  updateMutation.mutate({
                    id: editingItemId,
                    data: { title: editTitle, description: editDesc, category: editCategory, priority: editPriority, status: editStatus },
                  });
                }
              }}
              disabled={!editTitle.trim() || !editDesc.trim() || updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The item and all its notes will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
