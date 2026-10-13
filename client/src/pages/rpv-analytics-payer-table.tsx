/**
 * RPV Analytics — payer mix table sub-component.
 * Shows payer breakdown percentages per location.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { RpvLocation } from "./rpv-analytics-chart";

interface Props {
  locations: RpvLocation[];
}

function tierBadgeClass(pct: number): string {
  if (pct >= 40) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (pct >= 20) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-muted text-muted-foreground";
}

export function RpvPayerTable({ locations }: Props) {
  if (locations.length === 0) return null;

  // Collect all unique payer names across all locations
  const payerNames = Array.from(
    new Set(locations.flatMap((l) => l.payerMix.map((p) => p.payer)))
  ).sort();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Payer Mix by Location</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Location</TableHead>
                <TableHead>RPV</TableHead>
                {payerNames.map((p) => (
                  <TableHead key={p} className="text-center">{p}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => {
                const mixMap = Object.fromEntries(loc.payerMix.map((p) => [p.payer, p.pct]));
                return (
                  <TableRow key={loc.locationId} data-testid={`row-rpv-location-${loc.locationId}`}>
                    <TableCell className="font-medium">{loc.locationName}</TableCell>
                    <TableCell className="font-medium">${loc.rpv.toFixed(2)}</TableCell>
                    {payerNames.map((payer) => {
                      const pct = mixMap[payer] ?? 0;
                      return (
                        <TableCell key={payer} className="text-center">
                          {pct > 0 ? (
                            <Badge variant="outline" className={tierBadgeClass(pct)}>
                              {pct.toFixed(0)}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
