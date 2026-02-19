import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingDown, AlertTriangle, ChevronRight, ArrowDownRight } from "lucide-react";
import { Link } from "wouter";

export default function DecliningReferralsPage() {
  const [months, setMonths] = useState<number>(3);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/physicians/declining", months],
    queryFn: async () => {
      const res = await fetch(`/api/physicians/declining?months=${months}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const results = data?.data || [];
  const periodInfo = data?.period;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Card><CardContent className="p-4"><Skeleton className="h-96" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-declining-title">Declining Referrals</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Referring providers whose referral volume has dropped vs. the prior period
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Compare last</span>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="w-[110px]" data-testid="select-months">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 month</SelectItem>
              <SelectItem value="3">3 months</SelectItem>
              <SelectItem value="6">6 months</SelectItem>
              <SelectItem value="12">12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-chart-5/15 text-chart-5 shrink-0">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Declining Referring Providers</p>
              <p className="text-2xl font-bold" data-testid="text-declining-count">{results.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Current Period</p>
            <p className="text-sm font-medium" data-testid="text-current-period">
              {periodInfo?.currentStart} to {periodInfo?.currentEnd}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Prior Period</p>
            <p className="text-sm font-medium" data-testid="text-prior-period">
              {periodInfo?.priorStart} to {periodInfo?.priorEnd}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">At-Risk Referral Relationships</h3>
            <p className="text-xs text-muted-foreground">Sorted by largest decline</p>
          </div>
          <AlertTriangle className="w-4 h-4 text-chart-5" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[65vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Practice</TableHead>
                  <TableHead className="text-xs text-right">Prior</TableHead>
                  <TableHead className="text-xs text-right">Current</TableHead>
                  <TableHead className="text-xs text-right">Change</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r: any) => (
                  <TableRow key={r.physicianId} data-testid={`row-declining-${r.physicianId}`}>
                    <TableCell>
                      <Link href={`/physicians/${r.physicianId}`}>
                        <div className="flex items-center gap-2 cursor-pointer hover:underline">
                          <div className="w-7 h-7 rounded-md bg-chart-5/10 flex items-center justify-center text-chart-5 text-[10px] font-medium shrink-0">
                            {r.physician?.firstName?.[0]}{r.physician?.lastName?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium" data-testid={`link-physician-${r.physicianId}`}>
                              {r.physician?.firstName} {r.physician?.lastName}
                              {r.physician?.credentials ? `, ${r.physician.credentials}` : ""}
                            </p>
                            <p className="text-[10px] text-muted-foreground sm:hidden">{r.physician?.practiceName || ""}</p>
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                      {r.physician?.practiceName || "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.priorCount}</TableCell>
                    <TableCell className="text-right text-sm">{r.currentCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowDownRight className="w-3 h-3 text-chart-5" />
                        <span className="text-sm font-medium text-chart-5">{r.change}</span>
                        <Badge variant="outline" className="bg-chart-5/10 text-chart-5 text-[10px] ml-1">
                          {r.changePercent}%
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/physicians/${r.physicianId}`}>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {results.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm text-muted-foreground">No declining referral relationships found</p>
                      <p className="text-xs text-muted-foreground mt-1">All referring provider referrals are stable or growing</p>
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
