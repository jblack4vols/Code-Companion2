/**
 * Unit Economics Alerts — list and acknowledge financial threshold alerts.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Bell, BellOff, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FinancialAlert {
  id: string;
  locationId: string;
  alertType: string;
  metricName: string;
  metricValue: string;
  thresholdValue: string;
  severity: string;
  triggeredAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

function severityColor(s: string): string {
  if (s === "CRITICAL") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (s === "WARNING") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
}

function alertIcon(severity: string) {
  if (severity === "CRITICAL") return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />;
  if (severity === "WARNING") return <Bell className="w-4 h-4 text-yellow-500 shrink-0" />;
  return <Bell className="w-4 h-4 text-blue-500 shrink-0" />;
}

function formatMetricDescription(alert: FinancialAlert): string {
  const value = parseFloat(alert.metricValue);
  const threshold = parseFloat(alert.thresholdValue);
  const name = alert.metricName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  const isMonetary = alert.metricName.toLowerCase().includes("revenue") ||
    alert.metricName.toLowerCase().includes("cost") ||
    alert.metricName.toLowerCase().includes("contribution");
  const isPercent = alert.metricName.toLowerCase().includes("percent") ||
    alert.metricName.toLowerCase().includes("margin");
  const fmt = (v: number) => isMonetary ? `$${v.toFixed(2)}` : isPercent ? `${v.toFixed(1)}%` : v.toFixed(2);
  return `${name} ${fmt(value)} — threshold ${fmt(threshold)}`;
}

export default function UnitEconomicsAlertsPage() {
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<FinancialAlert[]>({
    queryKey: ["/api/unit-economics/alerts", showAcknowledged],
    queryFn: async () => {
      const param = showAcknowledged ? "" : "?acknowledged=false";
      const res = await fetch(`/api/unit-economics/alerts${param}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load alerts");
      return res.json();
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await apiRequest("POST", `/api/unit-economics/alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unit-economics/alerts"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: () => {
      toast({ title: "Failed to acknowledge alert", variant: "destructive" });
    },
  });

  const alerts = data || [];
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledgedAt).length;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-9 w-56" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Financial Alerts</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {unacknowledgedCount > 0
              ? `${unacknowledgedCount} unacknowledged alert${unacknowledgedCount !== 1 ? "s" : ""}`
              : "All alerts acknowledged"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-acknowledged"
            checked={showAcknowledged}
            onCheckedChange={setShowAcknowledged}
          />
          <Label htmlFor="show-acknowledged" className="text-sm cursor-pointer">
            Show acknowledged
          </Label>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
            <CheckCircle className="w-12 h-12 text-green-500/50" />
            <p className="text-sm text-muted-foreground">
              {showAcknowledged ? "No alerts found." : "No unacknowledged alerts. All clear!"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={alert.acknowledgedAt ? "opacity-60" : ""}
              data-testid={`card-alert-${alert.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{alertIcon(alert.severity)}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="outline" className={severityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{alert.alertType}</span>
                    </div>

                    <p className="text-sm font-medium">{formatMetricDescription(alert)}</p>

                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {alert.triggeredAt && (
                        <p className="text-xs text-muted-foreground">
                          Triggered: {format(new Date(alert.triggeredAt), "MMM d, yyyy h:mm a")}
                        </p>
                      )}
                      {alert.acknowledgedAt && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <BellOff className="w-3 h-3" />
                          Acknowledged: {format(new Date(alert.acknowledgedAt), "MMM d, yyyy h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>

                  {!alert.acknowledgedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => acknowledgeMutation.mutate(alert.id)}
                      disabled={acknowledgeMutation.isPending}
                      className="shrink-0"
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
