import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cloud, RefreshCw, CheckCircle, XCircle, Loader2, Globe, Database, Clock, AlertTriangle, Stethoscope, FileText, MessageSquare, ClipboardList, MapPin } from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SyncStatus {
  entity: string;
  siteId: string | null;
  listId: string | null;
  lastSyncAt: string | null;
  itemsSynced: number | null;
  itemsFailed: number | null;
  status: string | null;
  errorMessage: string | null;
}

interface SPSite {
  id: string;
  displayName: string;
  webUrl: string;
}

const ENTITY_META: Record<string, { label: string; icon: any; description: string }> = {
  physicians: { label: "Referring Providers", icon: Stethoscope, description: "Referring provider directory" },
  referrals: { label: "Referrals", icon: FileText, description: "Patient referral cases" },
  interactions: { label: "Interactions", icon: MessageSquare, description: "Outreach and visit logs" },
  tasks: { label: "Tasks", icon: ClipboardList, description: "Follow-up work queue" },
  locations: { label: "Locations", icon: MapPin, description: "Clinic locations" },
};

export default function SharePointSyncPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const { data: statusData, isLoading: loadingStatus } = useQuery<{ siteId: string | null; statuses: SyncStatus[] }>({
    queryKey: ["/api/sharepoint/status"],
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: 5000,
  });

  const { data: sites, isLoading: loadingSites, refetch: searchSites } = useQuery<SPSite[]>({
    queryKey: ["/api/sharepoint/sites", searchQuery],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: false,
  });

  const saveSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const res = await apiRequest("POST", "/api/sharepoint/site", { siteId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Site configured", description: `Connected to ${data.site?.displayName || "SharePoint site"}` });
      queryClient.invalidateQueries({ queryKey: ["/api/sharepoint/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to configure site", description: err.message, variant: "destructive" });
    },
  });

  const syncEntityMutation = useMutation({
    mutationFn: async (entity: string) => {
      const res = await apiRequest("POST", `/api/sharepoint/sync/${entity}`);
      return res.json();
    },
    onSuccess: (_data, entity) => {
      toast({ title: "Sync started", description: `Syncing ${ENTITY_META[entity]?.label || entity} to SharePoint...` });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/sharepoint/status"] }), 3000);
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sharepoint/sync-all");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Full sync started", description: "Syncing all entities to SharePoint Lists..." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/sharepoint/status"] }), 5000);
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    searchSites();
  };

  const siteConfigured = !!statusData?.siteId;
  const statuses = statusData?.statuses || [];
  const anySyncing = statuses.some(s => s.status === "SYNCING");

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto" data-testid="sharepoint-sync-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-sharepoint-title">SharePoint Sync</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Sync application data to SharePoint Lists for team-wide access</p>
      </div>

      <Card data-testid="card-site-config">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">SharePoint Site</h3>
          {siteConfigured && (
            <Badge variant="outline" className="ml-auto bg-chart-2/10 text-chart-2 border-chart-2/30" data-testid="badge-site-connected">
              <CheckCircle className="w-3 h-3 mr-1" /> Connected
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {siteConfigured ? (
            <div className="text-sm text-muted-foreground" data-testid="text-site-id">
              Site ID: <span className="font-mono text-xs">{statusData?.siteId}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Search for your SharePoint site or enter the site ID directly to configure where data will be synced.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="search-sites" className="text-xs text-muted-foreground mb-1 block">Search SharePoint sites</Label>
                  <Input
                    id="search-sites"
                    placeholder="e.g. Tristar or your organization name"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    data-testid="input-search-sites"
                  />
                </div>
                <Button onClick={handleSearch} disabled={loadingSites || !searchQuery.trim()} className="self-end" data-testid="button-search-sites">
                  {loadingSites ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                </Button>
              </div>

              {sites && sites.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Select a site</Label>
                  <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                    <SelectTrigger data-testid="select-site">
                      <SelectValue placeholder="Choose a SharePoint site..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id} data-testid={`select-site-${site.id}`}>
                          {site.displayName} ({site.webUrl})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => selectedSiteId && saveSiteMutation.mutate(selectedSiteId)}
                    disabled={!selectedSiteId || saveSiteMutation.isPending}
                    data-testid="button-save-site"
                  >
                    {saveSiteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Connect Site
                  </Button>
                </div>
              )}

              {sites && sites.length === 0 && (
                <p className="text-sm text-muted-foreground">No sites found. Try a different search term.</p>
              )}

              <div className="border-t pt-3">
                <Label htmlFor="manual-site-id" className="text-xs text-muted-foreground mb-1 block">Or enter Site ID directly</Label>
                <div className="flex gap-2">
                  <Input
                    id="manual-site-id"
                    placeholder="e.g. contoso.sharepoint.com,guid,guid"
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    data-testid="input-manual-site-id"
                  />
                  <Button
                    onClick={() => selectedSiteId && saveSiteMutation.mutate(selectedSiteId)}
                    disabled={!selectedSiteId || saveSiteMutation.isPending}
                    data-testid="button-connect-manual"
                  >
                    {saveSiteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Connect
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {siteConfigured && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold" data-testid="text-sync-heading">Data Sync Status</h2>
            <Button
              onClick={() => syncAllMutation.mutate()}
              disabled={anySyncing || syncAllMutation.isPending}
              data-testid="button-sync-all"
            >
              {(anySyncing || syncAllMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync All to SharePoint
            </Button>
          </div>

          <div className="grid gap-3">
            {Object.entries(ENTITY_META).map(([entity, meta]) => {
              const status = statuses.find(s => s.entity === entity);
              const Icon = meta.icon;
              const isSyncing = status?.status === "SYNCING";

              return (
                <Card key={entity} data-testid={`card-sync-${entity}`}>
                  <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-entity-label-${entity}`}>{meta.label}</span>
                        <SyncStatusBadge status={status?.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                      {status?.lastSyncAt && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span data-testid={`text-last-sync-${entity}`}>Last sync: {new Date(status.lastSyncAt).toLocaleString()}</span>
                          {status.itemsSynced != null && (
                            <span className="ml-2" data-testid={`text-items-synced-${entity}`}>
                              {status.itemsSynced} synced{status.itemsFailed ? `, ${status.itemsFailed} failed` : ""}
                            </span>
                          )}
                        </div>
                      )}
                      {status?.errorMessage && status.status === "ERROR" && (
                        <p className="text-xs text-destructive mt-1" data-testid={`text-error-${entity}`}>{status.errorMessage}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncEntityMutation.mutate(entity)}
                      disabled={isSyncing || syncEntityMutation.isPending}
                      data-testid={`button-sync-${entity}`}
                    >
                      {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                      Sync
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {loadingStatus && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading sync status...
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SyncStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="outline" className="text-xs">Never synced</Badge>;

  switch (status) {
    case "SYNCING":
      return <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/30 text-xs"><Loader2 className="w-3 h-3 animate-spin mr-1" /> Syncing</Badge>;
    case "COMPLETE":
      return <Badge variant="outline" className="bg-chart-2/10 text-chart-2 border-chart-2/30 text-xs"><CheckCircle className="w-3 h-3 mr-1" /> Complete</Badge>;
    case "ERROR":
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs"><XCircle className="w-3 h-3 mr-1" /> Error</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}
