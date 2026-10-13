/**
 * Patient Lifecycle — Discharge tab.
 * Shows discharge reason breakdown, dropout alerts, and location table.
 */
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface LocationDischarge {
  locationId: string;
  locationName: string;
  totalDischarged: number;
  byReason: Record<string, number>;
  dropoutAlert: boolean;
}

interface Props {
  totalDischarged: number;
  byReason: Record<string, number>;
  completionRate: number;
  byLocation: LocationDischarge[];
}

const REASON_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  PLATEAU: "Plateau",
  INSURANCE_DENIAL: "Insurance Denial",
  PATIENT_REQUEST: "Patient Request",
  LOST_TO_FOLLOWUP: "Lost to Follow-up",
  MOVED: "Moved",
  FINANCIAL: "Financial",
};

function reasonBadgeClass(reason: string): string {
  if (reason === "COMPLETED") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (reason === "PATIENT_REQUEST" || reason === "LOST_TO_FOLLOWUP") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
}

export function LifecycleDischargeTab({ totalDischarged, byReason, completionRate, byLocation }: Props) {
  const [showAll, setShowAll] = useState(false);
  const dropoutAlerts = byLocation.filter(l => l.dropoutAlert);

  // Sort reasons by count descending
  const reasonEntries = Object.entries(byReason).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* Reason breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Discharge Reasons ({totalDischarged} total)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {reasonEntries.map(([reason, count]) => {
              const pct = totalDischarged > 0 ? Math.round((count / totalDischarged) * 1000) / 10 : 0;
              return (
                <Badge key={reason} variant="outline" className={reasonBadgeClass(reason)}
                  data-testid={`badge-reason-${reason}`}>
                  {REASON_LABELS[reason] || reason}: {count} ({pct}%)
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Dropout alerts */}
      {dropoutAlerts.map(loc => {
        const patReq = loc.byReason.PATIENT_REQUEST || 0;
        const lost = loc.byReason.LOST_TO_FOLLOWUP || 0;
        const dropoutPct = loc.totalDischarged > 0 ? Math.round(((patReq + lost) / loc.totalDischarged) * 1000) / 10 : 0;
        return (
          <Alert key={loc.locationId} variant="destructive" data-testid={`alert-dropout-${loc.locationId}`}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{loc.locationName}</AlertTitle>
            <AlertDescription>
              {dropoutPct}% dropout rate (Patient Request: {patReq}, Lost to Follow-up: {lost}) — exceeds 20% threshold
            </AlertDescription>
          </Alert>
        );
      })}

      {/* Location table */}
      <Card>
        <CardHeader className="pb-2">
          <Button variant="ghost" size="sm" className="h-auto p-0 font-semibold text-sm justify-start"
            onClick={() => setShowAll(!showAll)} data-testid="button-toggle-discharge-locations">
            {showAll ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
            All Locations ({byLocation.length})
          </Button>
        </CardHeader>
        {showAll && (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Discharged</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Dropout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLocation.map(loc => {
                  const comp = loc.byReason.COMPLETED || 0;
                  const dropout = (loc.byReason.PATIENT_REQUEST || 0) + (loc.byReason.LOST_TO_FOLLOWUP || 0);
                  const compPct = loc.totalDischarged > 0 ? Math.round((comp / loc.totalDischarged) * 1000) / 10 : 0;
                  const dropPct = loc.totalDischarged > 0 ? Math.round((dropout / loc.totalDischarged) * 1000) / 10 : 0;
                  return (
                    <TableRow key={loc.locationId} data-testid={`row-discharge-${loc.locationId}`}>
                      <TableCell className="font-medium">{loc.locationName}</TableCell>
                      <TableCell className="text-right">{loc.totalDischarged}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={compPct >= 70
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}>
                          {comp} ({compPct}%)
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={dropPct <= 20
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}>
                          {dropout} ({dropPct}%)
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
