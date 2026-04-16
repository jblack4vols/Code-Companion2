/**
 * Patient Lifecycle — Attendance tab.
 * Shows arrival rate and visits/case alerts + collapsible location table.
 */
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface LocationAttendance {
  locationId: string;
  locationName: string;
  scheduled: number;
  arrived: number;
  arrivalRate: number;
  avgVisitsPerCase: number;
  arrivalAlert: boolean;
  visitsPerCaseAlert: boolean;
}

interface Props {
  totalScheduled: number;
  totalArrived: number;
  arrivalRate: number;
  avgVisitsPerCase: number;
  byLocation: LocationAttendance[];
}

function rateBadgeClass(rate: number, target: number): string {
  if (rate >= target) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (rate >= target - 10) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

export function LifecycleAttendanceTab({ totalScheduled, totalArrived, arrivalRate, avgVisitsPerCase, byLocation }: Props) {
  const [showAll, setShowAll] = useState(false);
  const arrivalAlerts = byLocation.filter(l => l.arrivalAlert);
  const vpcAlerts = byLocation.filter(l => l.visitsPerCaseAlert);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Scheduled Visits</p>
          <p className="text-2xl font-bold">{totalScheduled.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Arrived Visits</p>
          <p className="text-2xl font-bold">{totalArrived.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Arrival Rate</p>
          <p className="text-2xl font-bold">{arrivalRate}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Visits/Case</p>
          <p className="text-2xl font-bold">{avgVisitsPerCase}</p>
        </CardContent></Card>
      </div>

      {/* Arrival alerts */}
      {arrivalAlerts.map(loc => (
        <Alert key={`arr-${loc.locationId}`} variant="destructive" data-testid={`alert-arrival-${loc.locationId}`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{loc.locationName}</AlertTitle>
          <AlertDescription>
            Arrival rate {loc.arrivalRate}% — below 78% critical threshold ({loc.arrived}/{loc.scheduled} visits)
          </AlertDescription>
        </Alert>
      ))}

      {/* Visits per case alerts */}
      {vpcAlerts.map(loc => (
        <Alert key={`vpc-${loc.locationId}`} variant="destructive" data-testid={`alert-vpc-${loc.locationId}`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{loc.locationName}</AlertTitle>
          <AlertDescription>
            Avg {loc.avgVisitsPerCase} visits/case — below 8 visit target
          </AlertDescription>
        </Alert>
      ))}

      {/* Location table */}
      <Card>
        <CardHeader className="pb-2">
          <Button variant="ghost" size="sm" className="h-auto p-0 font-semibold text-sm justify-start"
            onClick={() => setShowAll(!showAll)} data-testid="button-toggle-attendance-locations">
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
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead className="text-right">Arrived</TableHead>
                  <TableHead className="text-right">Arrival Rate</TableHead>
                  <TableHead className="text-right">Visits/Case</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLocation.map(loc => (
                  <TableRow key={loc.locationId} data-testid={`row-attendance-${loc.locationId}`}>
                    <TableCell className="font-medium">{loc.locationName}</TableCell>
                    <TableCell className="text-right">{loc.scheduled.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{loc.arrived.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={rateBadgeClass(loc.arrivalRate, 85)}>
                        {loc.arrivalRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={loc.avgVisitsPerCase >= 8
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"}>
                        {loc.avgVisitsPerCase}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
