/**
 * Unit Economics Targets — configure financial thresholds. OWNER can edit, DIRECTOR can view.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, Lock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Location } from "@shared/schema";

interface FinancialTarget {
  id: string;
  locationId: string | null;
  metricName: string;
  targetValue: string;
  warningThreshold: string;
  criticalThreshold: string;
}

interface TargetRow {
  metricName: string;
  label: string;
  target: string;
  warning: string;
  critical: string;
  locationId: string | null;
}

const METRIC_LABELS: Record<string, string> = {
  revenuePerVisit: "Revenue per Visit ($)",
  costPerVisit: "Cost per Visit ($)",
  laborPercent: "Labor Percent (%)",
  providerRevenuePerWeek: "Provider Revenue / Week ($)",
};

const METRIC_KEYS = Object.keys(METRIC_LABELS);

function makeDefaultRows(locationId: string | null): TargetRow[] {
  return METRIC_KEYS.map((key) => ({
    metricName: key,
    label: METRIC_LABELS[key],
    target: "",
    warning: "",
    critical: "",
    locationId,
  }));
}

function mergeTargetsIntoRows(rows: TargetRow[], targets: FinancialTarget[]): TargetRow[] {
  return rows.map((row) => {
    const match = targets.find(
      (t) => t.metricName === row.metricName && t.locationId === row.locationId
    );
    if (!match) return row;
    return {
      ...row,
      target: match.targetValue ?? "",
      warning: match.warningThreshold ?? "",
      critical: match.criticalThreshold ?? "",
    };
  });
}

export default function UnitEconomicsTargetsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = user?.role === "OWNER";

  const [selectedLocationId, setSelectedLocationId] = useState<string>("__global__");
  const [globalRows, setGlobalRows] = useState<TargetRow[]>(makeDefaultRows(null));
  const [locationRows, setLocationRows] = useState<TargetRow[]>(makeDefaultRows(null));

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const activeLocations = locations?.filter((l) => l.isActive) || [];

  const { data: targets, isLoading } = useQuery<FinancialTarget[]>({
    queryKey: ["/api/unit-economics/targets"],
    queryFn: async () => {
      const res = await fetch("/api/unit-economics/targets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load targets");
      return res.json();
    },
  });

  // Initialise rows whenever targets load
  useEffect(() => {
    if (!targets) return;
    const globalDefaults = makeDefaultRows(null);
    setGlobalRows(mergeTargetsIntoRows(globalDefaults, targets));
  }, [targets]);

  // When location selection changes, re-populate location override rows
  useEffect(() => {
    if (!targets || selectedLocationId === "__global__") return;
    const locId = selectedLocationId;
    const locDefaults = makeDefaultRows(locId);
    setLocationRows(mergeTargetsIntoRows(locDefaults, targets));
  }, [targets, selectedLocationId]);

  const saveMutation = useMutation({
    mutationFn: async (payload: TargetRow[]) => {
      const targetsToSave = payload
        .filter((r) => r.target !== "" || r.warning !== "" || r.critical !== "")
        .map((r) => ({
          locationId: r.locationId,
          metricName: r.metricName,
          targetValue: r.target || null,
          warningThreshold: r.warning || null,
          criticalThreshold: r.critical || null,
        }));
      if (targetsToSave.length === 0) return;
      await apiRequest("PATCH", "/api/unit-economics/targets", { targets: targetsToSave });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unit-economics/targets"] });
      toast({ title: "Targets saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save targets", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const allRows = [
      ...globalRows,
      ...(selectedLocationId !== "__global__" ? locationRows : []),
    ];
    saveMutation.mutate(allRows);
  };

  function updateGlobalRow(metricName: string, field: "target" | "warning" | "critical", value: string) {
    setGlobalRows((prev) =>
      prev.map((r) => (r.metricName === metricName ? { ...r, [field]: value } : r))
    );
  }

  function updateLocationRow(metricName: string, field: "target" | "warning" | "critical", value: string) {
    setLocationRows((prev) =>
      prev.map((r) => (r.metricName === metricName ? { ...r, [field]: value } : r))
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-9 w-56" />
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Financial Targets</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Configure alert thresholds for unit economics metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isOwner && (
            <Badge variant="outline" className="flex items-center gap-1 text-xs">
              <Lock className="w-3 h-3" /> View only
            </Badge>
          )}
          <Button
            onClick={handleSave}
            disabled={!isOwner || saveMutation.isPending}
            size="sm"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Global defaults section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Global Defaults</CardTitle>
          <p className="text-xs text-muted-foreground">Applied to all locations unless overridden</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Metric</TableHead>
                  <TableHead className="min-w-[130px]">Target</TableHead>
                  <TableHead className="min-w-[130px]">Warning Threshold</TableHead>
                  <TableHead className="min-w-[130px]">Critical Threshold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {globalRows.map((row) => (
                  <TableRow key={row.metricName}>
                    <TableCell className="font-medium text-sm">{row.label}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.target}
                        onChange={(e) => updateGlobalRow(row.metricName, "target", e.target.value)}
                        disabled={!isOwner}
                        placeholder="—"
                        className="h-8 w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.warning}
                        onChange={(e) => updateGlobalRow(row.metricName, "warning", e.target.value)}
                        disabled={!isOwner}
                        placeholder="—"
                        className="h-8 w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.critical}
                        onChange={(e) => updateGlobalRow(row.metricName, "critical", e.target.value)}
                        disabled={!isOwner}
                        placeholder="—"
                        className="h-8 w-28"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Location overrides section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold">Location Overrides</CardTitle>
              <p className="text-xs text-muted-foreground">Blank values fall back to global defaults</p>
            </div>
            <Select value={selectedLocationId} onValueChange={(v) => setSelectedLocationId(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">— Select a location —</SelectItem>
                {activeLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {selectedLocationId === "__global__" ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
              Select a location to configure overrides
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Metric</TableHead>
                    <TableHead className="min-w-[130px]">Target</TableHead>
                    <TableHead className="min-w-[130px]">Warning Threshold</TableHead>
                    <TableHead className="min-w-[130px]">Critical Threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locationRows.map((row) => (
                    <TableRow key={row.metricName}>
                      <TableCell className="font-medium text-sm">{row.label}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.target}
                          onChange={(e) => updateLocationRow(row.metricName, "target", e.target.value)}
                          disabled={!isOwner}
                          placeholder="Global default"
                          className="h-8 w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.warning}
                          onChange={(e) => updateLocationRow(row.metricName, "warning", e.target.value)}
                          disabled={!isOwner}
                          placeholder="Global default"
                          className="h-8 w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.critical}
                          onChange={(e) => updateLocationRow(row.metricName, "critical", e.target.value)}
                          disabled={!isOwner}
                          placeholder="Global default"
                          className="h-8 w-28"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
