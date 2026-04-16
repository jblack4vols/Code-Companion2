/**
 * Provider Productivity v2 — collapsible location accordion section.
 * Renders a location header with aggregate KPIs and an expandable provider table.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ProviderProductivityV2Row } from "./provider-productivity-v2-row";
import type { ProviderRowData, ProviderStatus } from "./provider-productivity-v2-row";

export interface LocationRollup {
  location: string;
  providerCount: number;
  flaggedCount: number;
  avgVpd: number;
  avgUpv: number;
  status: ProviderStatus;
  providers: ProviderRowData[];
}

const STATUS_DOT: Record<ProviderStatus, string> = {
  on_target: "bg-green-500",
  near_target: "bg-amber-500",
  needs_coaching: "bg-red-500",
};

const STATUS_LABEL: Record<ProviderStatus, string> = {
  on_target: "On Target",
  near_target: "Near Target",
  needs_coaching: "Needs Coaching",
};

interface Props {
  rollup: LocationRollup;
  defaultOpen?: boolean;
}

export function ProviderProductivityV2Location({ rollup, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      {/* Location header — acts as accordion trigger */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
        data-testid={`button-location-${rollup.location.replace(/\s+/g, "-").toLowerCase()}`}
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}

        <span className="font-semibold text-sm flex-1">{rollup.location}</span>

        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[rollup.status]}`} title={STATUS_LABEL[rollup.status]} />

        {/* Aggregate KPIs */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground mr-2">
          <span>Avg VPD <span className="font-medium text-foreground">{rollup.avgVpd.toFixed(1)}</span></span>
          <span>Avg UPV <span className="font-medium text-foreground">{rollup.avgUpv.toFixed(2)}</span></span>
          <span>{rollup.providerCount} providers</span>
          {rollup.flaggedCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
              {rollup.flaggedCount} flagged
            </Badge>
          )}
        </div>
      </button>

      {/* Provider table */}
      {open && (
        <CardContent className="p-0 border-t">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="py-2 pl-3 pr-1 w-6" />
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">VPD</th>
                  <th className="py-2 pr-3">UPV</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Trend</th>
                  <th className="py-2 pr-3">Rev Gap</th>
                </tr>
              </thead>
              <tbody>
                {rollup.providers.map((provider) => (
                  <ProviderProductivityV2Row
                    key={`${provider.providerName}|${provider.locationId}`}
                    provider={provider}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
