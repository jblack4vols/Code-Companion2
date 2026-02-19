import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Award, TrendingUp, Search, Download, ChevronRight } from "lucide-react";
import { Link } from "wouter";

const tierConfig: Record<string, { label: string; color: string; desc: string }> = {
  A: { label: "Tier A", color: "bg-chart-4/15 text-chart-4", desc: "Top referrers" },
  B: { label: "Tier B", color: "bg-chart-1/15 text-chart-1", desc: "Regular referrers" },
  C: { label: "Tier C", color: "bg-chart-3/15 text-chart-3", desc: "Low referrers" },
  D: { label: "Tier D", color: "bg-muted text-muted-foreground", desc: "No referrals" },
};

export default function PhysicianTieringPage() {
  const now = new Date();
  const [period, setPeriod] = useState<string>("year");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  params.set("period", period);
  params.set("year", String(year));
  if (period === "month") params.set("month", String(month));

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/physicians/tiering", period, year, month],
    queryFn: async () => {
      const res = await fetch(`/api/physicians/tiering?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const allPhysicians = data?.physicians || [];
  const summary = data?.summary || { A: 0, B: 0, C: 0, D: 0 };
  const thresholds = data?.thresholds || { A: 20, B: 5, C: 1 };

  const filtered = allPhysicians.filter((p: any) => {
    if (filterTier !== "all" && p.tier !== filterTier) return false;
    if (search) {
      const term = search.toLowerCase();
      const matchName = `${p.firstName} ${p.lastName}`.toLowerCase().includes(term);
      const matchPractice = (p.practiceName || "").toLowerCase().includes(term);
      const matchNpi = (p.npi || "").includes(term);
      if (!matchName && !matchPractice && !matchNpi) return false;
    }
    return true;
  });

  const years = [];
  for (let y = now.getFullYear(); y >= 2024; y--) years.push(y);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-96" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-tiering-title">Referring Provider Tiering</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Categorize providers by referral volume ({period === "month" ? `${months[month-1]} ${year}` : year})
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[120px]" data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">Yearly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[100px]" data-testid="select-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {period === "month" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Month</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="w-[120px]" data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex-1" />
            <div className="text-xs text-muted-foreground">
              Thresholds: A ({thresholds.A}+) | B ({thresholds.B}-{thresholds.A - 1}) | C ({thresholds.C}-{thresholds.B - 1}) | D (0)
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["A", "B", "C", "D"] as const).map(tier => (
          <Card
            key={tier}
            className={`cursor-pointer hover-elevate ${filterTier === tier ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilterTier(filterTier === tier ? "all" : tier)}
            data-testid={`card-tier-${tier}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={tierConfig[tier].color}>{tierConfig[tier].label}</Badge>
                  </div>
                  <p className="text-2xl font-bold mt-1">{summary[tier]}</p>
                  <p className="text-[10px] text-muted-foreground">{tierConfig[tier].desc}</p>
                </div>
                <Award className={`w-8 h-8 opacity-20 ${tier === "A" ? "text-chart-4" : tier === "B" ? "text-chart-1" : tier === "C" ? "text-chart-3" : "text-muted-foreground"}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search providers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-tiering"
              />
            </div>
            {filterTier !== "all" && (
              <Badge variant="outline" className={`${tierConfig[filterTier].color} cursor-pointer`} onClick={() => setFilterTier("all")}>
                {tierConfig[filterTier].label} only
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{filtered.length} providers</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-xs">Tier</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Practice</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Specialty</TableHead>
                  <TableHead className="text-xs text-right">Referrals</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((p: any) => (
                  <TableRow key={p.id} data-testid={`row-tiering-${p.id}`}>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${tierConfig[p.tier]?.color || ""}`}>
                        {p.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/physicians/${p.id}`}>
                        <span className="text-sm font-medium hover:underline cursor-pointer" data-testid={`link-physician-${p.id}`}>
                          {p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{p.practiceName || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{p.specialty || "-"}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-medium">{p.referralCount}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/physicians/${p.id}`}>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      No providers found
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
