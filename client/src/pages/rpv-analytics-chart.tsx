/**
 * RPV Analytics — bar chart sub-component.
 * Shows revenue-per-visit by location with a $95 reference line.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from "recharts";

export const RPV_TARGET = 95;

export interface RpvLocation {
  locationId: string;
  locationName: string;
  rpv: number;
  totalVisits: number;
  monthlyGap: number;
  payerMix: { payer: string; pct: number }[];
}

interface Props {
  locations: RpvLocation[];
}

function barColor(rpv: number): string {
  if (rpv >= RPV_TARGET) return "hsl(var(--chart-2))";
  if (rpv >= 90) return "hsl(var(--chart-4))";
  return "hsl(var(--destructive))";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as RpvLocation;
  const gap = d.rpv - RPV_TARGET;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 text-sm shadow-md">
      <p className="font-medium mb-1">{d.locationName}</p>
      <p>RPV: <span className="font-semibold">${d.rpv.toFixed(2)}</span></p>
      <p className={gap >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
        {gap >= 0 ? `+$${gap.toFixed(2)} above target` : `-$${Math.abs(gap).toFixed(2)} below target`}
      </p>
      <p className="text-muted-foreground">{d.totalVisits.toLocaleString()} visits</p>
    </div>
  );
}

export function RpvChart({ locations }: Props) {
  const sorted = [...locations].sort((a, b) => b.rpv - a.rpv);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={sorted} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="locationName"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          domain={[60, 120]}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={RPV_TARGET}
          stroke="hsl(var(--chart-5))"
          strokeDasharray="5 3"
          label={{ value: `$${RPV_TARGET} target`, position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        />
        <Bar dataKey="rpv" radius={[4, 4, 0, 0]}>
          {sorted.map((loc) => (
            <Cell key={loc.locationId} fill={barColor(loc.rpv)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
