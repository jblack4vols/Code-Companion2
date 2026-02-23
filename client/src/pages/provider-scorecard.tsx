import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, FileText, MessageSquare, Phone, Mail, Calendar,
  Activity, TrendingUp, DollarSign, Award, Heart, Clock,
  ArrowRightLeft, BarChart3, CheckCircle2, AlertCircle, XCircle,
  Stethoscope, ClipboardList
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { getQueryFn } from "@/lib/queryClient";

const stageBadgeClass: Record<string, string> = {
  NEW: "bg-chart-1/15 text-chart-1",
  DEVELOPING: "bg-chart-3/15 text-chart-3",
  STRONG: "bg-chart-4/15 text-chart-4",
  AT_RISK: "bg-chart-5/15 text-chart-5",
};

const statusBadgeClass: Record<string, string> = {
  PROSPECT: "bg-chart-2/15 text-chart-2",
  ACTIVE: "bg-chart-4/15 text-chart-4",
  INACTIVE: "bg-muted text-muted-foreground",
};

const interactionTypeColors: Record<string, { bg: string; icon: any }> = {
  VISIT: { bg: "bg-chart-1/15 text-chart-1", icon: Stethoscope },
  CALL: { bg: "bg-chart-2/15 text-chart-2", icon: Phone },
  EMAIL: { bg: "bg-chart-3/15 text-chart-3", icon: Mail },
  EVENT: { bg: "bg-chart-4/15 text-chart-4", icon: Calendar },
  LUNCH: { bg: "bg-chart-5/15 text-chart-5", icon: Activity },
  OTHER: { bg: "bg-muted text-muted-foreground", icon: MessageSquare },
};

const referralStatusBadge: Record<string, string> = {
  RECEIVED: "bg-chart-2/15 text-chart-2",
  SCHEDULED: "bg-chart-3/15 text-chart-3",
  EVAL_COMPLETED: "bg-chart-4/15 text-chart-4",
  DISCHARGED: "bg-muted text-muted-foreground",
  LOST: "bg-chart-5/15 text-chart-5",
};

function HealthGauge({ score }: { score: number }) {
  const color = score >= 70 ? "text-green-500" : score >= 40 ? "text-amber-500" : "text-red-500";
  const bgColor = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  const percentage = Math.min(score, 100);
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" data-testid="health-score-gauge">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
        <circle
          cx="40" cy="40" r="36" fill="none" strokeWidth="6"
          stroke="currentColor"
          className={color}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-lg font-bold ${color}`}>{score}</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Health</span>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card data-testid={`card-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold mt-0.5" data-testid={`text-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

interface ScorecardData {
  physician: any;
  interactions: any[];
  referrals: any[];
  tasks: any[];
  stageHistory: any[];
  monthlySummaries: any[];
  metrics: {
    totalReferrals: number;
    convertedReferrals: number;
    conversionRate: number;
    totalRevenue: number;
    totalVisits: number;
    avgVisitsPerReferral: number;
    recentReferrals90d: number;
    healthScore: number;
    currentTier: string;
  };
}

export default function ProviderScorecardPage({ params }: { params: { id: string } }) {
  const { data, isLoading, error } = useQuery<ScorecardData>({
    queryKey: ["/api/physicians", params.id, "scorecard"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href={`/physicians/${params.id}`}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <p className="text-muted-foreground">Unable to load scorecard data.</p>
        </div>
      </div>
    );
  }

  const { physician, interactions, referrals, tasks, stageHistory, monthlySummaries, metrics } = data;

  const timelineItems = [
    ...interactions.map(i => ({
      type: "interaction" as const,
      date: new Date(i.occurredAt),
      id: `i-${i.id}`,
      data: i,
    })),
    ...referrals.map(r => ({
      type: "referral" as const,
      date: new Date(r.referralDate),
      id: `r-${r.id}`,
      data: r,
    })),
    ...stageHistory.map(s => ({
      type: "stage" as const,
      date: new Date(s.changedAt),
      id: `s-${s.id}`,
      data: s,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const maxMonthlyReferrals = Math.max(...monthlySummaries.map(s => s.referralsCount || 0), 1);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <Link href={`/physicians/${params.id}`}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" data-testid="text-physician-name">
            {physician.firstName} {physician.lastName}{physician.credentials ? `, ${physician.credentials}` : ""}
          </h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {physician.specialty && (
              <span className="text-sm text-muted-foreground">{physician.specialty}</span>
            )}
            {physician.specialty && physician.practiceName && (
              <span className="text-muted-foreground/50">·</span>
            )}
            {physician.practiceName && (
              <span className="text-sm text-muted-foreground">{physician.practiceName}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={statusBadgeClass[physician.status] || ""} data-testid="badge-status">
              {physician.status}
            </Badge>
            <Badge variant="outline" className={stageBadgeClass[physician.relationshipStage] || ""} data-testid="badge-stage">
              {physician.relationshipStage.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>
        <HealthGauge score={metrics.healthScore} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={FileText}
          label="Total Referrals"
          value={metrics.totalReferrals}
          sub={`${metrics.recentReferrals90d} in last 90 days`}
          color="bg-chart-1/15 text-chart-1"
        />
        <MetricCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={`${metrics.conversionRate}%`}
          sub={`${metrics.convertedReferrals} of ${metrics.totalReferrals} converted`}
          color="bg-chart-2/15 text-chart-2"
        />
        <MetricCard
          icon={DollarSign}
          label="Total Revenue"
          value={`$${metrics.totalRevenue.toLocaleString()}`}
          sub={`${metrics.avgVisitsPerReferral} avg visits/referral`}
          color="bg-green-500/15 text-green-600 dark:text-green-400"
        />
        <MetricCard
          icon={Award}
          label="Current Tier"
          value={`Tier ${metrics.currentTier}`}
          sub={`${metrics.totalVisits} total visits`}
          color="bg-chart-4/15 text-chart-4"
        />
      </div>

      <Tabs defaultValue="timeline" className="space-y-3">
        <TabsList data-testid="scorecard-tabs">
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            <Clock className="w-3.5 h-3.5 mr-1.5" />Timeline
          </TabsTrigger>
          <TabsTrigger value="referrals" data-testid="tab-referrals">
            <FileText className="w-3.5 h-3.5 mr-1.5" />Referrals
          </TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />Monthly Trends
          </TabsTrigger>
          <TabsTrigger value="stages" data-testid="tab-stages">
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />Stage History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card>
            <CardHeader className="pb-2">
              <h3 className="text-sm font-semibold">Activity Timeline</h3>
              <p className="text-xs text-muted-foreground">{timelineItems.length} events</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {timelineItems.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No activity recorded yet
                </div>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-auto">
                  {timelineItems.map((item) => {
                    if (item.type === "interaction") {
                      const i = item.data;
                      const typeConfig = interactionTypeColors[i.type] || interactionTypeColors.OTHER;
                      const IconComp = typeConfig.icon;
                      return (
                        <div key={item.id} className="flex items-start gap-3 p-2 rounded-md hover-elevate" data-testid={`timeline-item-${item.id}`}>
                          <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${typeConfig.bg}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{i.type}</Badge>
                              <span className="text-xs text-muted-foreground">{i.userName}</span>
                            </div>
                            <p className="text-sm mt-0.5 truncate">{i.summary}</p>
                            {i.nextStep && <p className="text-xs text-muted-foreground mt-0.5">Next: {i.nextStep}</p>}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
                            {format(item.date, "MMM d, yyyy")}
                          </span>
                        </div>
                      );
                    }
                    if (item.type === "referral") {
                      const r = item.data;
                      return (
                        <div key={item.id} className="flex items-start gap-3 p-2 rounded-md hover-elevate" data-testid={`timeline-item-${item.id}`}>
                          <div className="flex items-center justify-center w-8 h-8 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] ${referralStatusBadge[r.status] || ""}`}>{r.status.replace(/_/g, " ")}</Badge>
                              {r.patientInitialsOrAnonId && (
                                <span className="text-xs text-muted-foreground">Patient: {r.patientInitialsOrAnonId}</span>
                              )}
                            </div>
                            <p className="text-sm mt-0.5 truncate">{r.caseTitle || "Referral"}</p>
                            {r.arrivedVisits != null && (
                              <p className="text-xs text-muted-foreground mt-0.5">{r.arrivedVisits} arrived / {r.scheduledVisits || 0} scheduled visits</p>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
                            {format(item.date, "MMM d, yyyy")}
                          </span>
                        </div>
                      );
                    }
                    if (item.type === "stage") {
                      const s = item.data;
                      return (
                        <div key={item.id} className="flex items-start gap-3 p-2 rounded-md hover-elevate" data-testid={`timeline-item-${item.id}`}>
                          <div className="flex items-center justify-center w-8 h-8 rounded-md shrink-0 bg-chart-3/15 text-chart-3">
                            <ArrowRightLeft className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">Stage changed</span>
                            </div>
                            <p className="text-sm mt-0.5">
                              <Badge variant="outline" className={`text-[10px] mr-1 ${stageBadgeClass[s.previousStage] || ""}`}>
                                {(s.previousStage || "None").replace(/_/g, " ")}
                              </Badge>
                              <span className="text-muted-foreground mx-1">&rarr;</span>
                              <Badge variant="outline" className={`text-[10px] ${stageBadgeClass[s.newStage] || ""}`}>
                                {s.newStage.replace(/_/g, " ")}
                              </Badge>
                            </p>
                            {s.reason && <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>}
                            <p className="text-xs text-muted-foreground mt-0.5">by {s.changedByName || "System"}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
                            {format(item.date, "MMM d, yyyy")}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals">
          <Card>
            <CardHeader className="pb-2">
              <h3 className="text-sm font-semibold">Referrals</h3>
              <p className="text-xs text-muted-foreground">{referrals.length} total referrals</p>
            </CardHeader>
            <CardContent className="p-0">
              {referrals.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No referrals found
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Patient</TableHead>
                        <TableHead className="text-xs">Case</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Arrived</TableHead>
                        <TableHead className="text-xs text-right">Scheduled</TableHead>
                        <TableHead className="text-xs text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referrals.map((r: any) => (
                        <TableRow key={r.id} data-testid={`row-referral-${r.id}`}>
                          <TableCell className="text-xs">{format(new Date(r.referralDate), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-xs font-mono">{r.patientInitialsOrAnonId || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">{r.caseTitle || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${referralStatusBadge[r.status] || ""}`}>
                              {r.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right">{r.arrivedVisits ?? 0}</TableCell>
                          <TableCell className="text-xs text-right">{r.scheduledVisits ?? 0}</TableCell>
                          <TableCell className="text-xs text-right">{r.valueEstimate ? `$${Number(r.valueEstimate).toLocaleString()}` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader className="pb-2">
              <h3 className="text-sm font-semibold">Monthly Referral Trends</h3>
              <p className="text-xs text-muted-foreground">Last {monthlySummaries.length} months</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {monthlySummaries.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No monthly data available
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {[...monthlySummaries].reverse().map((s: any) => {
                      const barWidth = maxMonthlyReferrals > 0 ? (s.referralsCount / maxMonthlyReferrals) * 100 : 0;
                      return (
                        <div key={s.id || s.month} className="flex items-center gap-3" data-testid={`trend-bar-${s.month}`}>
                          <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">
                            {format(new Date(s.month + "T00:00:00"), "MMM yyyy")}
                          </span>
                          <div className="flex-1 h-7 bg-muted/30 rounded-md overflow-hidden relative">
                            <div
                              className="h-full bg-chart-1/60 rounded-md transition-all"
                              style={{ width: `${Math.max(barWidth, 2)}%` }}
                            />
                            <div className="absolute inset-0 flex items-center px-2">
                              <span className="text-xs font-medium">{s.referralsCount}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] w-8 justify-center shrink-0">
                            {s.tierLabel || "—"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">
                            {s.revenueGenerated ? `$${Number(s.revenueGenerated).toLocaleString()}` : "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">
                            {s.arrivalRate != null ? `${Math.round(s.arrivalRate * 100)}%` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-6 text-[10px] text-muted-foreground border-t pt-3 flex-wrap">
                    <span>Bar = Referral Count</span>
                    <span>Badge = Tier</span>
                    <span>$ = Revenue</span>
                    <span>% = Arrival Rate</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stages">
          <Card>
            <CardHeader className="pb-2">
              <h3 className="text-sm font-semibold">Stage Transition History</h3>
              <p className="text-xs text-muted-foreground">{stageHistory.length} transitions</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {stageHistory.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No stage changes recorded
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4">
                    {stageHistory.map((s: any) => (
                      <div key={s.id} className="flex items-start gap-4 pl-1" data-testid={`stage-history-${s.id}`}>
                        <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 border-background ${stageBadgeClass[s.newStage] ? stageBadgeClass[s.newStage].split(" ")[0] : "bg-muted"}`}>
                          <ArrowRightLeft className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] ${stageBadgeClass[s.previousStage] || ""}`}>
                              {(s.previousStage || "None").replace(/_/g, " ")}
                            </Badge>
                            <span className="text-muted-foreground text-xs">&rarr;</span>
                            <Badge variant="outline" className={`text-[10px] ${stageBadgeClass[s.newStage] || ""}`}>
                              {s.newStage.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          {s.reason && <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(s.changedAt), "MMM d, yyyy 'at' h:mm a")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">· {s.changedByName || "System"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
