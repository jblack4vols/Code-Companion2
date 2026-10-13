/**
 * Patient Lifecycle Funnel page.
 * Tabbed view: Conversion | Attendance | Discharge.
 * Single API fetch, client-side tab switching.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Location } from "@shared/schema";
import { format, startOfMonth, startOfYear, subDays } from "date-fns";
import { LifecycleConversionTab } from "./lifecycle-conversion-tab";
import { LifecycleAttendanceTab } from "./lifecycle-attendance-tab";
import { LifecycleDischargeTab } from "./lifecycle-discharge-tab";

type DatePreset = "this-month" | "last-30" | "last-90" | "ytd" | "custom";

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  switch (preset) {
    case "this-month": return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: todayStr };
    case "last-30": return { from: format(subDays(today, 30), "yyyy-MM-dd"), to: todayStr };
    case "last-90": return { from: format(subDays(today, 90), "yyyy-MM-dd"), to: todayStr };
    case "ytd": return { from: format(startOfYear(today), "yyyy-MM-dd"), to: todayStr };
    default: return { from: format(startOfYear(today), "yyyy-MM-dd"), to: todayStr };
  }
}

function statColor(value: number, target: number): string {
  if (value >= target) return "text-green-600 dark:text-green-400";
  if (value >= target * 0.9) return "text-yellow-600 dark:text-yellow-400";
  return "text-destructive";
}

interface FunnelData {
  dateRange: { from: string; to: string };
  conversion: { total: number; scheduled: number; evalCompleted: number; conversionRate: number; byLocation: any[] };
  attendance: { totalScheduled: number; totalArrived: number; arrivalRate: number; avgVisitsPerCase: number; byLocation: any[] };
  discharge: { totalDischarged: number; byReason: Record<string, number>; completionRate: number; byLocation: any[] };
}

export default function LifecyclePage() {
  const [preset, setPreset] = useState<DatePreset>("ytd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [locationId, setLocationId] = useState("all");

  const dates = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
    return getPresetDates(preset);
  }, [preset, customFrom, customTo]);

  const { data: locations } = useQuery<Location[]>({ queryKey: ["/api/locations"] });

  const queryParams = new URLSearchParams({ dateFrom: dates.from, dateTo: dates.to });
  if (locationId !== "all") queryParams.set("locationId", locationId);

  const { data, isLoading, isError } = useQuery<FunnelData>({
    queryKey: ["/api/lifecycle/funnel", queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/lifecycle/funnel?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold font-heading" data-testid="text-lifecycle-title">Patient Lifecycle</h1>
          <Badge variant="outline" className="text-xs">{dates.from} to {dates.to}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
            <SelectTrigger className="w-[140px]" data-testid="select-date-preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-30">Last 30 Days</SelectItem>
              <SelectItem value="last-90">Last 90 Days</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="w-[140px]" data-testid="input-custom-from" />
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="w-[140px]" data-testid="input-custom-to" />
            </>
          )}
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-[160px]" data-testid="select-location">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations?.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isError && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Failed to load lifecycle data. Please try again.</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Conversion Rate</p>
              <p className={`text-2xl font-bold ${statColor(data.conversion.conversionRate, 75)}`}>{data.conversion.conversionRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">Target: 75%</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Arrival Rate</p>
              <p className={`text-2xl font-bold ${statColor(data.attendance.arrivalRate, 85)}`}>{data.attendance.arrivalRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">Target: 85%</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Visits / Case</p>
              <p className={`text-2xl font-bold ${statColor(data.attendance.avgVisitsPerCase, 8)}`}>{data.attendance.avgVisitsPerCase}</p>
              <p className="text-xs text-muted-foreground mt-1">Target: 8+</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Completion Rate</p>
              <p className={`text-2xl font-bold ${statColor(data.discharge.completionRate, 70)}`}>{data.discharge.completionRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">Target: 70%</p>
            </CardContent></Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="conversion" data-testid="tabs-lifecycle">
            <TabsList>
              <TabsTrigger value="conversion" data-testid="tab-conversion">Conversion</TabsTrigger>
              <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance</TabsTrigger>
              <TabsTrigger value="discharge" data-testid="tab-discharge">Discharge</TabsTrigger>
            </TabsList>
            <TabsContent value="conversion" className="mt-4">
              <LifecycleConversionTab {...data.conversion} />
            </TabsContent>
            <TabsContent value="attendance" className="mt-4">
              <LifecycleAttendanceTab {...data.attendance} />
            </TabsContent>
            <TabsContent value="discharge" className="mt-4">
              <LifecycleDischargeTab {...data.discharge} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
