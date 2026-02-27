/**
 * Unit Economics Provider Productivity — leaderboard with date range filter and top/bottom performers.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";

interface ProviderEntry {
  userId: string;
  userName: string;
  locationName: string;
  totalVisits: number;
  totalUnits: number;
  unitsPerHour: number;
  hoursWorked: number;
  revenueGenerated: number;
  revenueTarget: number;
  targetAttainment: number;
}

type DatePreset = "this_month" | "last_month" | "last_3_months" | "custom";

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function targetColor(pct: number): string {
  if (pct >= 100) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (pct >= 80) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  if (preset === "this_month") {
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  }
  if (preset === "last_month") {
    const last = subMonths(now, 1);
    return {
      from: format(startOfMonth(last), "yyyy-MM-dd"),
      to: format(endOfMonth(last), "yyyy-MM-dd"),
    };
  }
  return {
    from: format(subDays(now, 90), "yyyy-MM-dd"),
    to: format(now, "yyyy-MM-dd"),
  };
}

export default function UnitEconomicsProviderProductivityPage() {
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { from, to } = preset === "custom"
    ? { from: customFrom, to: customTo }
    : getPresetDates(preset);

  const { data, isLoading } = useQuery<ProviderEntry[]>({
    queryKey: ["/api/unit-economics/providers", from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/unit-economics/providers?dateFrom=${from}&dateTo=${to}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load providers");
      return res.json();
    },
  });

  const presetButtons: { key: DatePreset; label: string }[] = [
    { key: "this_month", label: "This Month" },
    { key: "last_month", label: "Last Month" },
    { key: "last_3_months", label: "Last 3 Months" },
    { key: "custom", label: "Custom" },
  ];

  const providers = data || [];
  const top3 = providers.slice(0, 3);
  const bottom3 = providers.length > 3 ? providers.slice(-3).reverse() : [];

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Provider Productivity</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Leaderboard and attainment metrics</p>
        </div>

        {/* Date range controls */}
        <div className="flex flex-wrap items-center gap-2">
          {presetButtons.map((b) => (
            <Button
              key={b.key}
              size="sm"
              variant={preset === b.key ? "default" : "outline"}
              onClick={() => setPreset(b.key)}
            >
              {b.label}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
          </div>
        </div>
      )}

      {providers.length === 0 ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
            <Trophy className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No provider productivity data for this period.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top 3 performers */}
          {top3.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-green-700 dark:text-green-400">
                <TrendingUp className="w-4 h-4" /> Top Performers
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {top3.map((p, i) => (
                  <Card key={p.userId} className="border-l-4 border-l-green-500">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{p.userName}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.locationName}</p>
                        </div>
                        <span className="text-xs font-bold text-muted-foreground shrink-0">#{i + 1}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div><span className="text-muted-foreground">Revenue: </span><span className="font-medium">{fmt$(p.revenueGenerated)}</span></div>
                        <div><span className="text-muted-foreground">Visits: </span><span className="font-medium">{p.totalVisits}</span></div>
                        <div><span className="text-muted-foreground">Units/Hr: </span><span className="font-medium">{p.unitsPerHour.toFixed(1)}</span></div>
                        <div>
                          <Badge variant="outline" className={`text-[10px] px-1 ${targetColor(p.targetAttainment)}`}>
                            {p.targetAttainment.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Bottom 3 performers */}
          {bottom3.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                <TrendingDown className="w-4 h-4" /> Needs Attention
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {bottom3.map((p) => (
                  <Card key={p.userId} className="border-l-4 border-l-red-500">
                    <CardContent className="p-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{p.userName}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.locationName}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div><span className="text-muted-foreground">Revenue: </span><span className="font-medium">{fmt$(p.revenueGenerated)}</span></div>
                        <div><span className="text-muted-foreground">Visits: </span><span className="font-medium">{p.totalVisits}</span></div>
                        <div><span className="text-muted-foreground">Units/Hr: </span><span className="font-medium">{p.unitsPerHour.toFixed(1)}</span></div>
                        <div>
                          <Badge variant="outline" className={`text-[10px] px-1 ${targetColor(p.targetAttainment)}`}>
                            {p.targetAttainment.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Full leaderboard table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Full Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Visits</TableHead>
                      <TableHead>Units</TableHead>
                      <TableHead>Units/Hr</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>vs Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.map((p, i) => (
                      <TableRow key={p.userId} data-testid={`row-provider-${i}`}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.userName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.locationName}</TableCell>
                        <TableCell>{p.totalVisits.toLocaleString()}</TableCell>
                        <TableCell>{p.totalUnits.toLocaleString()}</TableCell>
                        <TableCell>{p.unitsPerHour.toFixed(1)}</TableCell>
                        <TableCell>{fmt$(p.revenueGenerated)}</TableCell>
                        <TableCell>{fmt$(p.revenueTarget)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={targetColor(p.targetAttainment)}>
                            {p.targetAttainment.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
