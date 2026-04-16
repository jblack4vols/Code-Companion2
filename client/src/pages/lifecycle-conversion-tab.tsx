/**
 * Patient Lifecycle — Conversion tab.
 * Shows alert banners for flagged locations + collapsible location table.
 */
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

interface LocationConversion {
  locationId: string;
  locationName: string;
  total: number;
  evalCompleted: number;
  conversionRate: number;
  alert: boolean;
}

interface Props {
  total: number;
  scheduled: number;
  evalCompleted: number;
  conversionRate: number;
  byLocation: LocationConversion[];
}

function rateBadgeClass(rate: number, target: number): string {
  if (rate >= target) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (rate >= target - 10) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

export function LifecycleConversionTab({ total, scheduled, evalCompleted, conversionRate, byLocation }: Props) {
  const [showAll, setShowAll] = useState(false);
  const alertLocations = byLocation.filter(l => l.alert);

  return (
    <div className="space-y-4">
      {/* Funnel summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Received</p>
          <p className="text-2xl font-bold">{total.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Scheduled</p>
          <p className="text-2xl font-bold">{scheduled.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Eval Completed</p>
          <p className="text-2xl font-bold">{evalCompleted.toLocaleString()}</p>
        </CardContent></Card>
      </div>

      {/* Alert banners */}
      {alertLocations.map(loc => (
        <Alert key={loc.locationId} variant="destructive" data-testid={`alert-conversion-${loc.locationId}`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{loc.locationName}</AlertTitle>
          <AlertDescription>
            Conversion rate {loc.conversionRate}% — below {loc.locationName.toLowerCase().includes("bean station") ? "75%" : "70%"} threshold ({loc.evalCompleted}/{loc.total} cases)
          </AlertDescription>
        </Alert>
      ))}

      {/* Collapsible location table */}
      <Card>
        <CardHeader className="pb-2">
          <Button variant="ghost" size="sm" className="h-auto p-0 font-semibold text-sm justify-start"
            onClick={() => setShowAll(!showAll)} data-testid="button-toggle-conversion-locations">
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
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Eval Completed</TableHead>
                  <TableHead className="text-right">Conversion Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLocation.map(loc => (
                  <TableRow key={loc.locationId} data-testid={`row-conversion-${loc.locationId}`}>
                    <TableCell className="font-medium">{loc.locationName}</TableCell>
                    <TableCell className="text-right">{loc.total}</TableCell>
                    <TableCell className="text-right">{loc.evalCompleted}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={rateBadgeClass(loc.conversionRate, 75)}>
                        {loc.conversionRate}%
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
