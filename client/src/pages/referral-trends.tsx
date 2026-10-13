import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, ArrowDownRight, Minus, ChevronRight, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { format, startOfMonth, subMonths, parse } from "date-fns";

interface TrendRow {
  physician_id: string;
  first_name: string;
  last_name: string;
  credentials: string | null;
  specialty: string | null;
  practice_name: string | null;
  relationship_stage: string;
  current_count: number | string;
  prior_count: number | string;
  change_absolute: number | string;
  change_percent: number | string | null;
  trend: "up" | "down" | "flat";
}

interface TrendResponse {
  currentMonth: string;
  priorMonth: string;
  totals: {
    current: number;
    prior: number;
    changeAbsolute: number;
    changePercent: number | null;
  };
  rows: TrendRow[];
}

type SortKey = "name" | "practice" | "prior_count" | "current_count" | "change_absolute" | "change_percent";
type SortDir = "asc" | "desc";

function defaultMonthInput(d: Date): string {
  return format(d, "yyyy-MM");
}

function formatMonthLabel(yyyymm: string): string {
  try {
    return format(parse(yyyymm + "-01", "yyyy-MM-dd", new Date()), "MMM yyyy");
  } catch {
    return yyyymm;
  }
}

export default function ReferralTrendsPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState<string>(defaultMonthInput(startOfMonth(today)));
  const [priorMonth, setPriorMonth] = useState<string>(defaultMonthInput(subMonths(startOfMonth(today), 1)));
  const [sortKey, setSortKey] = useState<SortKey>("change_absolute");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, isError } = useQuery<TrendResponse>({
    queryKey: ["/api/referrals/provider-trends", currentMonth, priorMonth],
    queryFn: async () => {
      const res = await fetch(
        `/api/referrals/provider-trends?currentMonth=${currentMonth}&priorMonth=${priorMonth}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch trends");
      return res.json();
    },
  });

  const sortedRows = useMemo(() => {
    const rows = (data?.rows ?? []).slice();
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "name":
          av = `${a.last_name} ${a.first_name}`.toLowerCase();
          bv = `${b.last_name} ${b.first_name}`.toLowerCase();
          break;
        case "practice":
          av = (a.practice_name ?? "").toLowerCase();
          bv = (b.practice_name ?? "").toLowerCase();
          break;
        case "prior_count":
          av = Number(a.prior_count); bv = Number(b.prior_count); break;
        case "current_count":
          av = Number(a.current_count); bv = Number(b.current_count); break;
        case "change_percent":
          av = a.change_percent === null ? -Infinity : Number(a.change_percent);
          bv = b.change_percent === null ? -Infinity : Number(b.change_percent);
          break;
        case "change_absolute":
        default:
          av = Number(a.change_absolute); bv = Number(b.change_absolute); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "practice" ? "asc" : "desc");
    }
  };

  const SortHeader = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={`text-xs cursor-pointer select-none ${className}`} onClick={() => toggleSort(k)}>
      <div className="inline-flex items-center gap-1">
        {children}
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );

  const totals = data?.totals;
  const totalChange = totals?.changeAbsolute ?? 0;
  const totalPct = totals?.changePercent;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-trends-title">Referral Trends by Provider</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Month-over-month referral counts per referring provider. Default is current vs prior month — change either picker to compare any two months.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="prior-month" className="text-xs">Prior</Label>
            <Input
              id="prior-month"
              type="month"
              value={priorMonth}
              onChange={(e) => setPriorMonth(e.target.value)}
              className="w-[140px]"
              data-testid="input-prior-month"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="current-month" className="text-xs">Current</Label>
            <Input
              id="current-month"
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="w-[140px]"
              data-testid="input-current-month"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentMonth(defaultMonthInput(startOfMonth(new Date())));
              setPriorMonth(defaultMonthInput(subMonths(startOfMonth(new Date()), 1)));
            }}
            data-testid="button-reset-trends"
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1" data-testid="text-prior-month-label">
              {formatMonthLabel(priorMonth)}
            </p>
            <p className="text-2xl font-bold" data-testid="text-prior-total">{totals?.prior ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">total referrals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1" data-testid="text-current-month-label">
              {formatMonthLabel(currentMonth)}
            </p>
            <p className="text-2xl font-bold" data-testid="text-current-total">{totals?.current ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">total referrals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
              totalChange > 0 ? "bg-chart-4/15 text-chart-4"
              : totalChange < 0 ? "bg-chart-5/15 text-chart-5"
              : "bg-muted text-muted-foreground"
            }`}>
              {totalChange > 0 ? <ArrowUpRight className="w-5 h-5" />
                : totalChange < 0 ? <ArrowDownRight className="w-5 h-5" />
                : <Minus className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Change</p>
              <p className={`text-2xl font-bold ${
                totalChange > 0 ? "text-chart-4" : totalChange < 0 ? "text-chart-5" : ""
              }`} data-testid="text-total-change">
                {totalChange > 0 ? "+" : ""}{totalChange}
              </p>
              {totalPct !== null && totalPct !== undefined && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {totalPct > 0 ? "+" : ""}{totalPct}%
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">Provider Comparison</h3>
            <p className="text-xs text-muted-foreground" data-testid="text-row-count">
              {sortedRows.length} provider{sortedRows.length === 1 ? "" : "s"} with referrals in either month
            </p>
          </div>
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[65vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader k="name">Provider</SortHeader>
                  <SortHeader k="practice" className="hidden sm:table-cell">Practice</SortHeader>
                  <SortHeader k="prior_count" className="text-right">Prior</SortHeader>
                  <SortHeader k="current_count" className="text-right">Current</SortHeader>
                  <SortHeader k="change_absolute" className="text-right">Change</SortHeader>
                  <SortHeader k="change_percent" className="text-right">%</SortHeader>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`skel-${i}`}>
                      <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                    </TableRow>
                  ))
                )}
                {isError && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                      Failed to load trends. Try a different month range or refresh.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && sortedRows.map((r) => {
                  const change = Number(r.change_absolute);
                  const pct = r.change_percent === null ? null : Number(r.change_percent);
                  const trend = r.trend;
                  return (
                    <TableRow key={r.physician_id} data-testid={`row-trend-${r.physician_id}`}>
                      <TableCell>
                        <Link href={`/physicians/${r.physician_id}`}>
                          <div className="flex items-center gap-2 cursor-pointer hover:underline">
                            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary text-[10px] font-medium shrink-0">
                              {r.first_name?.[0] ?? ""}{r.last_name?.[0] ?? ""}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {r.first_name} {r.last_name}{r.credentials ? `, ${r.credentials}` : ""}
                              </p>
                              <p className="text-[10px] text-muted-foreground sm:hidden truncate">{r.practice_name ?? ""}</p>
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden sm:table-cell truncate max-w-[180px]">
                        {r.practice_name || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">{Number(r.prior_count)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{Number(r.current_count)}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {trend === "up" && <ArrowUpRight className="w-3 h-3 text-chart-4" />}
                          {trend === "down" && <ArrowDownRight className="w-3 h-3 text-chart-5" />}
                          {trend === "flat" && <Minus className="w-3 h-3 text-muted-foreground" />}
                          <span className={`text-sm ${
                            trend === "up" ? "text-chart-4 font-medium"
                            : trend === "down" ? "text-chart-5 font-medium"
                            : "text-muted-foreground"
                          }`}>
                            {change > 0 ? "+" : ""}{change}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {pct === null ? (
                          <Badge variant="outline" className="text-[10px]">new</Badge>
                        ) : (
                          <span className={`text-xs ${
                            trend === "up" ? "text-chart-4"
                            : trend === "down" ? "text-chart-5"
                            : "text-muted-foreground"
                          }`}>
                            {pct > 0 ? "+" : ""}{pct}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/physicians/${r.physician_id}`}>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && !isError && sortedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm text-muted-foreground">No referrals in either selected month.</p>
                      <p className="text-xs text-muted-foreground mt-1">Try a different month range.</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
