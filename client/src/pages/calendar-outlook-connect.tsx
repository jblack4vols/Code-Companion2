/**
 * Outlook calendar connection status + action buttons.
 * Shown in the calendar page header. Fetches /api/outlook/status to
 * determine if the current user has a linked Microsoft account.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OutlookStatus {
  connected: boolean;
  email?: string;
}

export function CalendarOutlookConnect() {
  const { toast } = useToast();

  const { data: status, isLoading } = useQuery<OutlookStatus>({
    queryKey: ["/api/outlook/status"],
    queryFn: async () => {
      const res = await fetch("/api/outlook/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Outlook status");
      return res.json();
    },
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/outlook/sync", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Outlook synced", description: `${data.upserted ?? 0} events imported` });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/outlook/disconnect", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlook/status"] });
      toast({ title: "Outlook disconnected" });
    },
    onError: (err: Error) => toast({ title: "Disconnect failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  if (!status?.connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => { window.location.href = "/api/outlook/connect"; }}
        data-testid="button-connect-outlook"
      >
        Connect Outlook Calendar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid="outlook-connected-section">
      <Badge
        variant="outline"
        className="bg-chart-3/10 text-chart-3 border-chart-3/30 text-xs"
        data-testid="badge-outlook-connected"
      >
        Outlook: {status.email ?? "Connected"}
      </Badge>
      <Button
        variant="outline"
        size="sm"
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
        data-testid="button-outlook-sync-now"
      >
        {syncMutation.isPending ? "Syncing..." : "Sync Now"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => disconnectMutation.mutate()}
        disabled={disconnectMutation.isPending}
        data-testid="button-outlook-disconnect"
      >
        {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
      </Button>
    </div>
  );
}
