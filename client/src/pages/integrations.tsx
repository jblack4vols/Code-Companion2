import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plug, Zap, Globe, Key, RefreshCw, CheckCircle, XCircle, Loader2, Plus, Trash2, Copy, Eye, EyeOff,
  ArrowUpDown, Clock, Shield, AlertTriangle, ExternalLink, Mail, FileSpreadsheet,
} from "lucide-react";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { IntegrationConfig, ApiKey } from "@shared/schema";

const STATUS_BADGE: Record<string, { label: string; variant: string; icon: any }> = {
  CONNECTED: { label: "Connected", variant: "bg-green-500/15 text-green-600 dark:text-green-400", icon: CheckCircle },
  DISCONNECTED: { label: "Not Connected", variant: "bg-muted text-muted-foreground", icon: XCircle },
  ERROR: { label: "Error", variant: "bg-red-500/15 text-red-600 dark:text-red-400", icon: AlertTriangle },
};

interface SyncLog {
  id: string;
  direction: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  details: Record<string, any>;
  startedAt: string;
  finishedAt: string | null;
}

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("connections");
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["physicians:read", "referrals:read", "locations:read"]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const [ghlApiKey, setGhlApiKey] = useState<string | null>(null);
  const [ghlLocationId, setGhlLocationId] = useState<string | null>(null);
  const [customBaseUrl, setCustomBaseUrl] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string | null>(null);
  const [customWebhookUrl, setCustomWebhookUrl] = useState<string | null>(null);

  const { data: integrations = [], isLoading: loadingIntegrations } = useQuery<IntegrationConfig[]>({
    queryKey: ["/api/integrations"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: apiKeysData = [], isLoading: loadingKeys } = useQuery<(ApiKey & { rawKey?: string })[]>({
    queryKey: ["/api/api-keys"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const ghlConfig = integrations.find((i) => i.type === "GOHIGHLEVEL");
  const customConfig = integrations.find((i) => i.type === "CUSTOM_API");

  const createIntegration = useMutation({
    mutationFn: async (data: { type: string; name: string; settings: Record<string, any> }) =>
      apiRequest("POST", "/api/integrations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Integration created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateIntegration = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/integrations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Integration updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const testConnection = useMutation({
    mutationFn: async (id: string) => {
      const resp = await apiRequest("POST", `/api/integrations/${id}/test`);
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({
        title: data.success ? "Connection Successful" : "Connection Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
  });

  const syncIntegration = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: string }) => {
      const resp = await apiRequest("POST", `/api/integrations/${id}/sync`, { direction });
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({
        title: data.success ? "Sync Complete" : "Sync Failed",
        description: data.message || `Processed: ${data.processed || 0}, Failed: ${data.failed || 0}`,
        variant: data.success ? "default" : "destructive",
      });
    },
  });

  const createApiKey = useMutation({
    mutationFn: async (data: { name: string; scopes: string[] }) => {
      const resp = await apiRequest("POST", "/api/api-keys", data);
      return resp.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setGeneratedKey(data.rawKey);
      setShowKey(true);
      toast({ title: "API Key Created", description: "Copy your key now — it won't be shown again." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deactivateApiKey = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({ title: "API Key Deactivated" });
    },
  });

  const ghlApiKeyVal = ghlApiKey ?? (ghlConfig?.settings as any)?.apiKey ?? "";
  const ghlLocationIdVal = ghlLocationId ?? (ghlConfig?.settings as any)?.locationId ?? "";
  const customBaseUrlVal = customBaseUrl ?? (customConfig?.settings as any)?.baseUrl ?? "";
  const customApiKeyVal = customApiKey ?? (customConfig?.settings as any)?.apiKey ?? "";
  const customWebhookUrlVal = customWebhookUrl ?? (customConfig?.settings as any)?.webhookUrl ?? "";

  const handleSaveGhl = () => {
    const settings = { apiKey: ghlApiKeyVal, locationId: ghlLocationIdVal };
    if (ghlConfig) {
      updateIntegration.mutate({ id: ghlConfig.id, data: { settings } });
    } else {
      createIntegration.mutate({ type: "GOHIGHLEVEL", name: "GoHighLevel", settings });
    }
  };

  const handleSaveCustom = () => {
    const settings = { baseUrl: customBaseUrlVal, apiKey: customApiKeyVal, webhookUrl: customWebhookUrlVal };
    if (customConfig) {
      updateIntegration.mutate({ id: customConfig.id, data: { settings } });
    } else {
      createIntegration.mutate({ type: "CUSTOM_API", name: "Custom API", settings });
    }
  };

  const statusBadge = (status: string) => {
    const s = STATUS_BADGE[status] || STATUS_BADGE.DISCONNECTED;
    const Icon = s.icon;
    return (
      <Badge variant="outline" className={s.variant}>
        <Icon className="w-3 h-3 mr-1" />
        {s.label}
      </Badge>
    );
  };

  const availableScopes = [
    { value: "physicians:read", label: "Referring Providers (Read)" },
    { value: "referrals:read", label: "Referrals (Read)" },
    { value: "locations:read", label: "Locations (Read)" },
    { value: "interactions:read", label: "Interactions (Read)" },
    { value: "webhook:write", label: "Webhook (Write)" },
    { value: "*", label: "All Access" },
  ];

  if (loadingIntegrations) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-integrations">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">API Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect Tristar 360 to external services and manage API access</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="connections" data-testid="tab-connections">
            <Plug className="w-4 h-4 mr-1.5" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="tab-api-keys">
            <Key className="w-4 h-4 mr-1.5" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="microsoft" data-testid="tab-microsoft">
            <Globe className="w-4 h-4 mr-1.5" />
            Microsoft
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4 mt-4">
          {/* GoHighLevel Card */}
          <Card data-testid="card-gohighlevel">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-orange-500/10">
                  <Zap className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <CardTitle className="text-base">GoHighLevel</CardTitle>
                  <CardDescription>Two-way sync of referring provider contacts and leads</CardDescription>
                </div>
              </div>
              {statusBadge(ghlConfig?.status || "DISCONNECTED")}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ghl-api-key">API Key</Label>
                  <Input
                    id="ghl-api-key"
                    type="password"
                    placeholder="Enter your GHL API key"
                    value={ghlApiKeyVal}
                    onChange={(e) => setGhlApiKey(e.target.value)}
                    data-testid="input-ghl-api-key"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ghl-location">Location ID (optional)</Label>
                  <Input
                    id="ghl-location"
                    placeholder="GHL Location ID"
                    value={ghlLocationIdVal}
                    onChange={(e) => setGhlLocationId(e.target.value)}
                    data-testid="input-ghl-location"
                  />
                </div>
              </div>

              {ghlConfig?.lastSyncAt && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Last sync: {new Date(ghlConfig.lastSyncAt).toLocaleString()}
                  {ghlConfig.lastSyncStatus && ` — ${ghlConfig.lastSyncStatus}`}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={handleSaveGhl} disabled={updateIntegration.isPending || createIntegration.isPending} data-testid="button-save-ghl">
                  {(updateIntegration.isPending || createIntegration.isPending) && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  Save
                </Button>
                {ghlConfig && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => testConnection.mutate(ghlConfig.id)}
                      disabled={testConnection.isPending}
                      data-testid="button-test-ghl"
                    >
                      {testConnection.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                      Test Connection
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => syncIntegration.mutate({ id: ghlConfig.id, direction: "push" })}
                      disabled={syncIntegration.isPending}
                      data-testid="button-sync-ghl-push"
                    >
                      {syncIntegration.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ArrowUpDown className="w-4 h-4 mr-1.5" />}
                      Push to GHL
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => syncIntegration.mutate({ id: ghlConfig.id, direction: "pull" })}
                      disabled={syncIntegration.isPending}
                      data-testid="button-sync-ghl-pull"
                    >
                      {syncIntegration.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                      Pull from GHL
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Custom API Card */}
          <Card data-testid="card-custom-api">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-500/10">
                  <Globe className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Custom API</CardTitle>
                  <CardDescription>Connect to your own software via REST API</CardDescription>
                </div>
              </div>
              {statusBadge(customConfig?.status || "DISCONNECTED")}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="custom-base-url">Base URL</Label>
                  <Input
                    id="custom-base-url"
                    placeholder="https://your-software.com/api"
                    value={customBaseUrlVal}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    data-testid="input-custom-base-url"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custom-api-key">API Key (for outbound calls)</Label>
                  <Input
                    id="custom-api-key"
                    type="password"
                    placeholder="API key for your software"
                    value={customApiKeyVal}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    data-testid="input-custom-api-key"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-webhook">Webhook URL (optional)</Label>
                <Input
                  id="custom-webhook"
                  placeholder="https://your-software.com/webhook"
                  value={customWebhookUrlVal}
                  onChange={(e) => setCustomWebhookUrl(e.target.value)}
                  data-testid="input-custom-webhook"
                />
                <p className="text-xs text-muted-foreground">Tristar will send events to this URL when data changes</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={handleSaveCustom} disabled={updateIntegration.isPending || createIntegration.isPending} data-testid="button-save-custom">
                  {(updateIntegration.isPending || createIntegration.isPending) && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  Save
                </Button>
                {customConfig && (
                  <Button
                    variant="outline"
                    onClick={() => testConnection.mutate(customConfig.id)}
                    disabled={testConnection.isPending}
                    data-testid="button-test-custom"
                  >
                    {testConnection.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                    Test Connection
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4 mt-4">
          <Card data-testid="card-api-keys">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base">Tristar Public API Keys</CardTitle>
                <CardDescription>Create API keys for your external software to access Tristar data</CardDescription>
              </div>
              <Dialog open={showNewKeyDialog} onOpenChange={(open) => { setShowNewKeyDialog(open); if (!open) { setGeneratedKey(null); setNewKeyName(""); } }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-api-key">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create API Key
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{generatedKey ? "API Key Created" : "Create API Key"}</DialogTitle>
                    <DialogDescription>
                      {generatedKey
                        ? "Copy your API key now. It will not be shown again."
                        : "Create a key for external software to access Tristar data."}
                    </DialogDescription>
                  </DialogHeader>

                  {generatedKey ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Input value={showKey ? generatedKey : "••••••••••••••••••••"} readOnly data-testid="input-generated-key" />
                        <Button size="icon" variant="outline" onClick={() => setShowKey(!showKey)} data-testid="button-toggle-key">
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => { navigator.clipboard.writeText(generatedKey); toast({ title: "Copied to clipboard" }); }}
                          data-testid="button-copy-key"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                        <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>Store this key securely. It cannot be retrieved after closing this dialog.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Key Name</Label>
                        <Input
                          placeholder="e.g., My Custom App"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          data-testid="input-key-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Permissions</Label>
                        {availableScopes.map((scope) => (
                          <div key={scope.value} className="flex items-center gap-2">
                            <Checkbox
                              id={`scope-${scope.value}`}
                              checked={newKeyScopes.includes(scope.value)}
                              onCheckedChange={(checked) => {
                                setNewKeyScopes(
                                  checked
                                    ? [...newKeyScopes, scope.value]
                                    : newKeyScopes.filter((s) => s !== scope.value)
                                );
                              }}
                              data-testid={`checkbox-scope-${scope.value}`}
                            />
                            <Label htmlFor={`scope-${scope.value}`} className="text-sm font-normal">{scope.label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    {generatedKey ? (
                      <Button onClick={() => { setShowNewKeyDialog(false); setGeneratedKey(null); setNewKeyName(""); }} data-testid="button-done-key">
                        Done
                      </Button>
                    ) : (
                      <Button
                        onClick={() => createApiKey.mutate({ name: newKeyName, scopes: newKeyScopes })}
                        disabled={!newKeyName.trim() || createApiKey.isPending}
                        data-testid="button-generate-key"
                      >
                        {createApiKey.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                        Generate Key
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loadingKeys ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : apiKeysData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-api-keys">
                  <Key className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No API keys created yet</p>
                  <p className="text-xs mt-1">Create a key to allow external software to access Tristar data</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apiKeysData.map((key) => (
                    <div key={key.id} className="flex items-center justify-between gap-4 p-3 rounded-md border" data-testid={`row-api-key-${key.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{key.name}</span>
                          <Badge variant="outline" className="text-xs font-mono">{key.keyPrefix}••••</Badge>
                          {!key.isActive && <Badge variant="outline" className="bg-red-500/15 text-red-600 dark:text-red-400 text-xs">Revoked</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                          {key.lastUsedAt && <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                          <span>{((key.scopes as string[]) || []).join(", ")}</span>
                        </div>
                      </div>
                      {key.isActive && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deactivateApiKey.mutate(key.id)}
                          data-testid={`button-revoke-key-${key.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 rounded-md border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  API Documentation
                </h3>
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>Your external software can access Tristar data using these endpoints:</p>
                  <div className="bg-muted/50 rounded-md p-3 font-mono text-xs space-y-1">
                    <p className="text-foreground">GET /api/public/physicians</p>
                    <p className="text-foreground">GET /api/public/physicians/:id</p>
                    <p className="text-foreground">GET /api/public/referrals</p>
                    <p className="text-foreground">GET /api/public/locations</p>
                    <p className="text-foreground">GET /api/public/interactions</p>
                    <p className="text-foreground">POST /api/public/webhook</p>
                  </div>
                  <p>Include your API key in every request:</p>
                  <div className="bg-muted/50 rounded-md p-3 font-mono text-xs">
                    <p className="text-foreground">X-TRISTAR-API-KEY: tsk_your_key_here</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="microsoft" className="space-y-4 mt-4">
          <Card data-testid="card-microsoft">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-600/10">
                  <Globe className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Microsoft 365</CardTitle>
                  <CardDescription>Outlook email and SharePoint Lists are pre-configured</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="bg-green-500/15 text-green-600 dark:text-green-400">
                <CheckCircle className="w-3 h-3 mr-1" />
                Available
              </Badge>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Outlook Instructions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-semibold">Outlook (Email & Calendar)</h3>
                </div>
                <div className="rounded-md border p-4 space-y-3 text-sm">
                  <p className="text-muted-foreground">Outlook integration allows Tristar to send welcome emails and sync calendar events.</p>
                  <div className="space-y-2">
                    <p className="font-medium">How to connect:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground ml-1">
                      <li>In the Replit workspace, open the <strong>Integrations</strong> panel (puzzle piece icon in left toolbar)</li>
                      <li>Find <strong>Microsoft Outlook</strong> and click <strong>Connect</strong></li>
                      <li>Sign in with your Microsoft 365 account when prompted</li>
                      <li>Grant the requested permissions (Mail.Send, Calendars.ReadWrite)</li>
                      <li>Once connected, Tristar can automatically send emails and sync calendar events</li>
                    </ol>
                  </div>
                  <div className="rounded-md bg-blue-500/10 p-3 text-xs flex items-start gap-2 text-blue-700 dark:text-blue-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>The Outlook connection is managed through Replit's integration system. If it disconnects, re-authenticate through the Integrations panel.</span>
                  </div>
                </div>
              </div>

              {/* SharePoint Instructions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <h3 className="text-sm font-semibold">SharePoint Lists</h3>
                </div>
                <div className="rounded-md border p-4 space-y-3 text-sm">
                  <p className="text-muted-foreground">SharePoint sync pushes referring providers, referrals, interactions, tasks, and locations to SharePoint Lists for reporting.</p>
                  <div className="space-y-2">
                    <p className="font-medium">How to connect:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground ml-1">
                      <li>In the Replit workspace, open the <strong>Integrations</strong> panel (puzzle piece icon in left toolbar)</li>
                      <li>Find <strong>Microsoft SharePoint</strong> and click <strong>Connect</strong></li>
                      <li>Sign in with your Microsoft 365 account and grant permissions</li>
                      <li>Go to <strong>Administration &gt; SharePoint Sync</strong> in this app</li>
                      <li>Search for and select your SharePoint site</li>
                      <li>Click <strong>Sync All</strong> to push data, or sync individual entities</li>
                    </ol>
                  </div>
                  <Button variant="outline" asChild data-testid="button-goto-sharepoint">
                    <a href="/admin/sharepoint">
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                      Go to SharePoint Sync
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
