/**
 * Provider Productivity v2 — individual provider row with expandable coaching details.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

export type ProviderStatus = "on_target" | "near_target" | "needs_coaching";
export type TrendDirection = "up" | "down" | "flat";

export interface ProviderRowData {
  providerName: string;
  providerRole: string;
  locationName: string;
  locationId: string;
  vpdCurrent: number;
  upvCurrent: number;
  daysWorked: number;
  weeklyRevGap: number;
  vpdTrendDirection: TrendDirection;
  status: ProviderStatus;
  rootCause: string | null;
  coachingNotes: string[];
}

const STATUS_BADGE: Record<ProviderStatus, string> = {
  on_target: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  near_target: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  needs_coaching: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_LABEL: Record<ProviderStatus, string> = {
  on_target: "On Target",
  near_target: "Near Target",
  needs_coaching: "Needs Coaching",
};

const ROOT_CAUSE_LABEL: Record<string, string> = {
  scheduling_fill_rate: "Scheduling / Fill Rate",
  cpt_undercapture: "CPT Undercapture",
  rushing_missing_units: "Rushing / Missing Units",
  both_kpis_low: "Both KPIs Low",
  visits_per_case_low: "Visits Per Case Low",
};

function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (direction === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

interface Props {
  provider: ProviderRowData;
}

export function ProviderProductivityV2Row({ provider }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasCoaching = provider.coachingNotes.length > 0;

  return (
    <>
      <tr
        className="border-b transition-colors hover:bg-muted/30 cursor-pointer"
        onClick={() => hasCoaching && setExpanded((v) => !v)}
        data-testid={`row-provider-${provider.providerName.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {/* Expand toggle */}
        <td className="py-2 pl-3 pr-1 w-6">
          {hasCoaching ? (
            expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <span className="w-3.5 h-3.5 inline-block" />
          )}
        </td>

        {/* Name */}
        <td className="py-2 pr-3">
          <span className="text-sm font-medium">{provider.providerName}</span>
        </td>

        {/* Role */}
        <td className="py-2 pr-3">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
            {provider.providerRole}
          </Badge>
        </td>

        {/* VPD */}
        <td className="py-2 pr-3 text-sm tabular-nums">
          {provider.vpdCurrent.toFixed(1)}
        </td>

        {/* UPV */}
        <td className="py-2 pr-3 text-sm tabular-nums">
          {provider.upvCurrent.toFixed(2)}
        </td>

        {/* Status */}
        <td className="py-2 pr-3">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[provider.status]}`}
            data-testid={`badge-status-${provider.status}`}
          >
            {STATUS_LABEL[provider.status]}
          </Badge>
        </td>

        {/* Trend */}
        <td className="py-2 pr-3">
          <TrendIcon direction={provider.vpdTrendDirection} />
        </td>

        {/* Rev Gap */}
        <td className="py-2 pr-3 text-sm tabular-nums">
          <span className={provider.weeklyRevGap >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
            {provider.weeklyRevGap >= 0 ? "+" : ""}
            {provider.weeklyRevGap.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          </span>
        </td>
      </tr>

      {/* Expanded coaching details */}
      {expanded && hasCoaching && (
        <tr className="border-b bg-muted/20">
          <td colSpan={8} className="py-3 pl-10 pr-4">
            <div className="space-y-2">
              {provider.rootCause && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Root Cause: {ROOT_CAUSE_LABEL[provider.rootCause] ?? provider.rootCause}
                </p>
              )}
              <ul className="space-y-1">
                {provider.coachingNotes.map((note, i) => (
                  <li key={i} className="text-xs text-foreground flex gap-2">
                    <span className="text-muted-foreground shrink-0">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
