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
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm space-y-2" data-testid="ghl-setup-guide">
                <p className="font-medium text-blue-900 dark:text-blue-200">How to get your API key:</p>
                <ol className="list-decimal ml-4 text-blue-800 dark:text-blue-300 space-y-1">
                  <li>Log in to your GoHighLevel account</li>
                  <li>Go to <strong>Settings &rarr; Business Profile &rarr; Integrations</strong> (or <strong>Settings &rarr; Developer / API</strong>)</li>
                  <li>Click <strong>Create Private Integration Token</strong></li>
                  <li>Name it "Tristar 360" and select scopes: <strong>contacts.readonly, contacts.write, locations.readonly</strong></li>
                  <li>Copy the generated token and paste it below</li>
                </ol>
                <p className="text-xs text-blue-700 dark:text-blue-400">The Location ID is found in your GHL sub-account URL or under Settings &rarr; Business Info.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ghl-api-key">Private Integration Token</Label>
                  <Input
                    id="ghl-api-key"
                    type="password"
                    placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={ghlApiKeyVal}
                    onChange={(e) => setGhlApiKey(e.target.value)}
                    data-testid="input-ghl-api-key"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ghl-location">Location ID (recommended)</Label>
                  <Input
                    id="ghl-location"
                    placeholder="e.g. abc123DEFghiJKL"
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

              <div className="mt-6 space-y-4">
                <div className="rounded-md border p-4 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Quick Start Guide
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-3">
                    <p>
                      The Tristar API lets other tools and software pull your referring provider, referral, and location data automatically — no manual exports needed. Here's how to get started:
                    </p>

                    <div className="space-y-2">
                      <p className="font-medium text-foreground">Step 1: Create an API Key</p>
                      <p>Click the <strong>"Create API Key"</strong> button above. Give it a name (e.g. "Zapier" or "My Report Tool"), choose what data it can access, and click <strong>Generate Key</strong>. Copy the key immediately — you won't be able to see it again.</p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-medium text-foreground">Step 2: Use Your Key</p>
                      <p>Every request to the API must include your key in a special header. Here is exactly what to provide when any tool asks for it:</p>
                      <div className="bg-muted/50 rounded-md p-3 space-y-2 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground shrink-0 w-20">Header name:</span>
                          <code className="text-foreground font-mono select-all">X-TRISTAR-API-KEY</code>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground shrink-0 w-20">Header value:</span>
                          <code className="text-foreground font-mono">tsk_your_key_here</code>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="font-medium text-foreground">Step 3: Pick a Data Endpoint</p>
                      <p>Each URL below returns a different set of data. Replace <code className="text-xs bg-muted px-1 py-0.5 rounded">your-app-url</code> with your published Tristar 360 web address.</p>
                      <div className="bg-muted/50 rounded-md p-3 font-mono text-xs space-y-2">
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0 font-mono">GET</Badge>
                          <div>
                            <p className="text-foreground select-all">https://your-app-url/api/public/physicians</p>
                            <p className="text-muted-foreground font-sans mt-0.5">All referring providers with name, NPI, specialty, and contact info</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0 font-mono">GET</Badge>
                          <div>
                            <p className="text-foreground select-all">https://your-app-url/api/public/referrals</p>
                            <p className="text-muted-foreground font-sans mt-0.5">All patient referral cases with dates, status, and linked provider</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0 font-mono">GET</Badge>
                          <div>
                            <p className="text-foreground select-all">https://your-app-url/api/public/locations</p>
                            <p className="text-muted-foreground font-sans mt-0.5">All 8 Tristar clinic locations</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0 font-mono">GET</Badge>
                          <div>
                            <p className="text-foreground select-all">https://your-app-url/api/public/interactions</p>
                            <p className="text-muted-foreground font-sans mt-0.5">All logged outreach visits, calls, and emails</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0 font-mono">POST</Badge>
                          <div>
                            <p className="text-foreground select-all">https://your-app-url/api/public/webhook</p>
                            <p className="text-muted-foreground font-sans mt-0.5">Send data into Tristar from an outside system</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-4 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Where Can I Use This?
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-3">
                    <p>You don't need to write code. Many popular tools can connect to the Tristar API with just a few clicks:</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="font-medium text-foreground text-sm">Microsoft Power Automate</p>
                        <p className="text-xs">Use the "HTTP" action. Paste a Tristar endpoint URL, set Method to GET, and add a header <code className="bg-muted px-1 py-0.5 rounded">X-TRISTAR-API-KEY</code> with your key as the value.</p>
                      </div>
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="font-medium text-foreground text-sm">Zapier</p>
                        <p className="text-xs">Use the "Webhooks by Zapier" action (Custom Request). Enter the URL, choose GET, and add <code className="bg-muted px-1 py-0.5 rounded">X-TRISTAR-API-KEY</code> under Headers.</p>
                      </div>
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="font-medium text-foreground text-sm">Google Sheets</p>
                        <p className="text-xs">Use a Google Apps Script or a plugin like "Import API" to pull Tristar data directly into a spreadsheet on a schedule.</p>
                      </div>
                      <div className="rounded-md border p-3 space-y-1">
                        <p className="font-medium text-foreground text-sm">Excel / Power Query</p>
                        <p className="text-xs">In Excel, go to Data &gt; Get Data &gt; From Web. Enter a Tristar endpoint URL and add the API key header under Advanced settings.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-4 space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Example: What the Data Looks Like
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-3">
                    <p>When you call the referring providers endpoint, you get back a list like this (simplified):</p>
                    <div className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-x-auto">
                      <pre className="text-foreground whitespace-pre">{`[
  {
    "firstName": "John",
    "lastName": "Smith",
    "npi": "1234567890",
    "specialty": "Orthopedic Surgery",
    "practiceName": "East TN Ortho",
    "city": "Johnson City",
    "phone": "(423) 555-0100",
    "status": "ACTIVE",
    "tier": "A"
  },
  ...
]`}</pre>
                    </div>
                    <p>The referrals endpoint returns case records like this:</p>
                    <div className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-x-auto">
                      <pre className="text-foreground whitespace-pre">{`[
  {
    "patientFullName": "Jane Doe",
    "referralDate": "2025-06-15",
    "status": "EVAL_COMPLETED",
    "locationName": "Johnson City",
    "referringProviderName": "Dr. John Smith",
    "referringProviderNpi": "1234567890"
  },
  ...
]`}</pre>
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-blue-500/10 p-4 text-sm flex items-start gap-3 text-blue-700 dark:text-blue-300">
                  <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">Need help connecting?</p>
                    <p className="text-xs opacity-80">If you're working with an IT consultant or developer, share this page with them. They'll need your published app URL and an API key (which you create above). All endpoints return standard JSON data and require the <code className="bg-blue-500/20 px-1 py-0.5 rounded">X-TRISTAR-API-KEY</code> header.</p>
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
