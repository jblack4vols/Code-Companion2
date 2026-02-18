import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Users, DollarSign, UserCheck, Activity, Map } from "lucide-react";
import { format, subMonths } from "date-fns";
import type { Territory } from "@shared/schema";

function generateMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    options.push({ value: format(d, "yyyy-MM-01"), label: format(d, "MMMM yyyy") });
  }
  return options;
}

function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return "$" + num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function TerritoryDashboardPage() {
  const monthOptions = generateMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]?.value || monthOptions[0].value);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>("");

  const { data: territories, isLoading: loadingTerritories } = useQuery<Territory[]>({
    queryKey: ["/api/territories"],
  });

  const { data: territoryData, isLoading: loadingTerritory } = useQuery<any>({
    queryKey: ["/api/dashboard/territory", selectedTerritoryId, { month: selectedMonth }],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/territory/${selectedTerritoryId}?month=${selectedMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch territory data");
      return res.json();
    },
    enabled: !!selectedTerritoryId,
  });

  const summaries = territoryData?.summaries || [];
  const latestSummary = summaries[0] || null;

  if (loadingTerritories) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!territories || territories.length === 0) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-territory-dashboard-title">Territory Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Performance metrics by territory</p>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <Map className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-medium text-muted-foreground mb-2">No Territories Found</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Territories need to be created before you can view territory-level performance data. Go to the Territories page to create and manage territories for your team.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-territory-dashboard-title">Territory Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Performance metrics by territory</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedTerritoryId} onValueChange={setSelectedTerritoryId}>
            <SelectTrigger className="w-[220px]" data-testid="select-territory-filter">
              <SelectValue placeholder="Select Territory" />
            </SelectTrigger>
            <SelectContent>
              {territories.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]" data-testid="select-month-filter">
              <SelectValue placeholder="Select Month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedTerritoryId ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              <Map className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">Select a territory to view performance metrics</p>
            </div>
          </CardContent>
        </Card>
      ) : loadingTerritory ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card data-testid="card-territory-referrals">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Referrals</p>
                <p className="text-2xl font-bold mt-0.5">{(latestSummary?.referralsCount || 0).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-territory-visits">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Total Visits</p>
                <p className="text-2xl font-bold mt-0.5">{(latestSummary?.totalVisits || 0).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-territory-revenue">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-4/15 text-chart-4">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold mt-0.5">{formatCurrency(latestSummary?.revenueTotal || 0)}</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-territory-revenue-per-rep">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-3/15 text-chart-3">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Revenue/Rep</p>
                <p className="text-2xl font-bold mt-0.5">{formatCurrency(latestSummary?.revenuePerRep || 0)}</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-territory-visits-per-rep">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md shrink-0 bg-chart-5/15 text-chart-5">
                <Activity className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Visits/Rep</p>
                <p className="text-2xl font-bold mt-0.5">{(latestSummary?.visitsPerRep || 0).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
