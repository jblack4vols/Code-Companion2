/**
 * Referral Intelligence — sortable referral sources table sub-component.
 * Columns: Name, Practice, Payer Tier, Cases YTD, YoY Delta, ROI Score, Days Since Referral.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { tierBadgeClass, daysBadgeClass, roiBadgeClass } from "@/lib/badge-helpers";

export interface ReferralSource {
  id: string;
  name: string;
  practice: string;
  payerTier: "A" | "B" | "C";
  casesYtd: number;
  yoyDelta: number;
  roiScore: number;
  daysSinceReferral: number;
}

type SortKey = keyof Pick<ReferralSource, "casesYtd" | "yoyDelta" | "roiScore" | "daysSinceReferral">;

function SortIcon({ field, current, dir }: { field: SortKey; current: SortKey; dir: "asc" | "desc" }) {
  if (field !== current) return <ArrowUpDown className="w-3.5 h-3.5 ml-1 inline opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="w-3.5 h-3.5 ml-1 inline" />
    : <ArrowDown className="w-3.5 h-3.5 ml-1 inline" />;
}

interface Props {
  sources: ReferralSource[];
}

export function ReferralIntelligenceTable({ sources }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("casesYtd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...sources].sort((a, b) => {
    const mult = sortDir === "asc" ? 1 : -1;
    return (a[sortKey] - b[sortKey]) * mult;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Referral Sources</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Provider</TableHead>
                <TableHead>Practice</TableHead>
                <TableHead className="text-center">Tier</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 font-medium"
                    onClick={() => handleSort("casesYtd")} data-testid="button-sort-cases-ytd">
                    Cases YTD <SortIcon field="casesYtd" current={sortKey} dir={sortDir} />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 font-medium"
                    onClick={() => handleSort("yoyDelta")} data-testid="button-sort-yoy-delta">
                    YoY Delta <SortIcon field="yoyDelta" current={sortKey} dir={sortDir} />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 font-medium"
                    onClick={() => handleSort("roiScore")} data-testid="button-sort-roi-score">
                    ROI Score <SortIcon field="roiScore" current={sortKey} dir={sortDir} />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 font-medium"
                    onClick={() => handleSort("daysSinceReferral")} data-testid="button-sort-days-since">
                    Last Referral <SortIcon field="daysSinceReferral" current={sortKey} dir={sortDir} />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No referral source data available.
                  </TableCell>
                </TableRow>
              ) : sorted.map((s) => (
                <TableRow key={s.id} data-testid={`row-referral-source-${s.id}`}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.practice}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={tierBadgeClass(s.payerTier)}>
                      {s.payerTier}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.casesYtd.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={s.yoyDelta >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                      {s.yoyDelta >= 0 ? "+" : ""}{s.yoyDelta}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roiBadgeClass(s.roiScore)}>
                      {s.roiScore}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={daysBadgeClass(s.daysSinceReferral)}>
                      {s.daysSinceReferral}d
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
