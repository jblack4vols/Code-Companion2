import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trophy, Medal, Star, Users, Target, CheckCircle, Activity } from "lucide-react";
import { format, subDays } from "date-fns";

interface LeaderboardEntry {
  userId: string;
  name: string;
  role: string;
  totalInteractions: number;
  visits: number;
  calls: number;
  emails: number;
  lunches: number;
  uniqueProvidersTouched: number;
  referralsGenerated: number;
  referralsConverted: number;
  totalVisits: number;
  tasksCompleted: number;
  tasksOpen: number;
  performanceScore: number;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  dateRange: { from: string; to: string };
}

const roleBadgeStyles: Record<string, string> = {
  OWNER: "bg-red-500/15 text-red-600 dark:text-red-400",
  DIRECTOR: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  MARKETER: "bg-green-500/15 text-green-600 dark:text-green-400",
};

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  DIRECTOR: "Director",
  MARKETER: "Marketer",
};

const podiumColors = [
  { bg: "from-yellow-500/20 to-yellow-600/5 dark:from-yellow-500/15 dark:to-yellow-600/5", border: "border-yellow-500/30", text: "text-yellow-600 dark:text-yellow-400", label: "Gold" },
  { bg: "from-slate-300/30 to-slate-400/5 dark:from-slate-400/15 dark:to-slate-500/5", border: "border-slate-400/30", text: "text-slate-500 dark:text-slate-300", label: "Silver" },
  { bg: "from-amber-700/15 to-amber-800/5 dark:from-amber-600/15 dark:to-amber-700/5", border: "border-amber-700/30", text: "text-amber-700 dark:text-amber-500", label: "Bronze" },
];

export default function TeamLeaderboardPage() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const queryUrl = `/api/leaderboard?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: [queryUrl],
  });

  const leaderboard = data?.leaderboard
    ? [...data.leaderboard].sort((a, b) => b.performanceScore - a.performanceScore)
    : [];

  const top3 = leaderboard.slice(0, 3);

  const teamTotals = leaderboard.reduce(
    (acc, entry) => ({
      interactions: acc.interactions + entry.totalInteractions,
      referralsGenerated: acc.referralsGenerated + entry.referralsGenerated,
      referralsConverted: acc.referralsConverted + entry.referralsConverted,
      tasksCompleted: acc.tasksCompleted + entry.tasksCompleted,
      uniqueProviders: acc.uniqueProviders + entry.uniqueProvidersTouched,
    }),
    { interactions: 0, referralsGenerated: 0, referralsConverted: 0, tasksCompleted: 0, uniqueProviders: 0 },
  );

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-leaderboard-title">Team Leaderboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1" data-testid="text-leaderboard-subtitle">
            Performance rankings for your team
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="input-date-from"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="input-date-to"
            />
          </div>
        </div>
      </div>

      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="section-podium">
          {top3.map((entry, idx) => {
            const colors = podiumColors[idx];
            const RankIcon = idx === 0 ? Trophy : idx === 1 ? Medal : Star;
            const cardSize = idx === 0 ? "sm:scale-105 sm:z-10" : "";
            return (
              <Card
                key={entry.userId}
                className={`relative overflow-visible bg-gradient-to-b ${colors.bg} ${colors.border} border ${cardSize}`}
                data-testid={`card-podium-${idx + 1}`}
              >
                <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full bg-background/80 dark:bg-background/60 ${colors.text}`}>
                    <RankIcon className="w-6 h-6" />
                  </div>
                  <div className={`text-2xl font-bold ${colors.text}`} data-testid={`text-podium-rank-${idx + 1}`}>
                    #{idx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-base" data-testid={`text-podium-name-${idx + 1}`}>{entry.name}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] mt-1 ${roleBadgeStyles[entry.role] || ""}`}
                      data-testid={`badge-podium-role-${idx + 1}`}
                    >
                      {roleLabels[entry.role] || entry.role}
                    </Badge>
                  </div>
                  <div className={`text-3xl font-bold ${colors.text}`} data-testid={`text-podium-score-${idx + 1}`}>
                    {entry.performanceScore.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Performance Score</p>
                  <div className="grid grid-cols-3 gap-3 w-full mt-1 text-xs">
                    <div>
                      <p className="font-semibold" data-testid={`text-podium-interactions-${idx + 1}`}>{entry.totalInteractions}</p>
                      <p className="text-muted-foreground text-[10px]">Interactions</p>
                    </div>
                    <div>
                      <p className="font-semibold" data-testid={`text-podium-referrals-${idx + 1}`}>{entry.referralsGenerated}</p>
                      <p className="text-muted-foreground text-[10px]">Referrals</p>
                    </div>
                    <div>
                      <p className="font-semibold" data-testid={`text-podium-converted-${idx + 1}`}>{entry.referralsConverted}</p>
                      <p className="text-muted-foreground text-[10px]">Converted</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card data-testid="card-leaderboard-table">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <div>
            <h3 className="text-sm font-semibold">Full Leaderboard</h3>
            <p className="text-xs text-muted-foreground">Ranked by performance score</p>
          </div>
          <Trophy className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {leaderboard.length > 0 ? (
            <div className="overflow-x-auto">
              <Table data-testid="table-leaderboard">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Interactions</TableHead>
                    <TableHead className="text-right">Providers</TableHead>
                    <TableHead className="text-right">Referrals</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right">Tasks Done</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((entry, idx) => (
                    <TableRow key={entry.userId} data-testid={`row-leaderboard-${entry.userId}`}>
                      <TableCell className="font-medium" data-testid={`text-rank-${entry.userId}`}>
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-name-${entry.userId}`}>{entry.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${roleBadgeStyles[entry.role] || ""}`}
                            data-testid={`badge-role-${entry.userId}`}
                          >
                            {roleLabels[entry.role] || entry.role}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold" data-testid={`text-score-${entry.userId}`}>
                        {entry.performanceScore.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default underline decoration-dotted underline-offset-2" data-testid={`text-interactions-${entry.userId}`}>
                              {entry.totalInteractions}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent data-testid={`tooltip-interactions-${entry.userId}`}>
                            <div className="text-xs space-y-0.5">
                              <p>Visits: {entry.visits}</p>
                              <p>Calls: {entry.calls}</p>
                              <p>Emails: {entry.emails}</p>
                              <p>Lunches: {entry.lunches}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-providers-${entry.userId}`}>
                        {entry.uniqueProvidersTouched}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-referrals-${entry.userId}`}>
                        {entry.referralsGenerated}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-converted-${entry.userId}`}>
                        {entry.referralsConverted}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-tasks-${entry.userId}`}>
                        {entry.tasksCompleted}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground" data-testid="text-no-data">
              No leaderboard data for this period
            </div>
          )}
        </CardContent>
      </Card>

      {leaderboard.length > 0 && (
        <Card data-testid="card-team-totals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <h3 className="text-sm font-semibold">Team Activity Summary</h3>
              <p className="text-xs text-muted-foreground">Aggregate totals for the selected period</p>
            </div>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md shrink-0 bg-chart-1/15 text-chart-1">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold" data-testid="text-total-interactions">{teamTotals.interactions.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Interactions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md shrink-0 bg-chart-2/15 text-chart-2">
                  <Target className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold" data-testid="text-total-referrals">{teamTotals.referralsGenerated.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Referrals</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md shrink-0 bg-chart-4/15 text-chart-4">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold" data-testid="text-total-converted">{teamTotals.referralsConverted.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Converted</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md shrink-0 bg-chart-3/15 text-chart-3">
                  <Star className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold" data-testid="text-total-tasks">{teamTotals.tasksCompleted.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Tasks Done</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-md shrink-0 bg-chart-5/15 text-chart-5">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold" data-testid="text-total-providers">{teamTotals.uniqueProviders.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">Providers</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
