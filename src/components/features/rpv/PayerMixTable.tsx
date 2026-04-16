// src/components/features/rpv/PayerMixTable.tsx
// Payer mix breakdown table showing BCBS/Medicare/Commercial/Medicaid
// split per location with a stacked visual bar and revenue estimates.
// Server Component — no interactivity needed here.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { RpvLocationWithMetrics } from '@/types/rpv'
import { cn } from '@/lib/utils'

interface PayerMixTableProps {
  locations: RpvLocationWithMetrics[]
}

export function PayerMixTable({ locations }: PayerMixTableProps) {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <Table style={{ tableLayout: 'fixed', minWidth: '700px' }}>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[16%] text-xs">Location</TableHead>
              <TableHead className="w-[16%] text-xs">Payer mix</TableHead>
              <TableHead className="w-[8%] text-xs">
                <span className="text-blue-700">BCBS</span>
              </TableHead>
              <TableHead className="w-[9%] text-xs">
                <span className="text-teal-700">Medicare</span>
              </TableHead>
              <TableHead className="w-[10%] text-xs">
                <span className="text-amber-700">Commercial</span>
              </TableHead>
              <TableHead className="w-[9%] text-xs">
                <span className="text-red-600">Medicaid</span>
              </TableHead>
              <TableHead className="w-[9%] text-xs">WC/VA</TableHead>
              <TableHead className="w-[11%] text-xs">Visits/mo</TableHead>
              <TableHead className="w-[12%] text-xs">Monthly rev</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((loc) => (
              <PayerMixRow key={loc.id} location={loc} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PayerMixRow
// ---------------------------------------------------------------------------
function PayerMixRow({ location: loc }: { location: RpvLocationWithMetrics }) {
  const wcVaPct = +(loc.payer_wc_pct + loc.payer_va_pct).toFixed(1)

  // Flag locations where Medicaid > 30% — the primary RPV drag
  const highMedicaid = loc.payer_medicaid_pct > 30

  return (
    <TableRow className="hover:bg-muted/20 transition-colors">
      {/* Location */}
      <TableCell className="font-medium text-sm">{loc.location}</TableCell>

      {/* Stacked payer bar */}
      <TableCell>
        <div className="flex h-2 rounded-full overflow-hidden gap-px">
          <div
            className="bg-blue-500"
            style={{ flex: loc.payer_bcbs_pct }}
            title={`BCBS ${loc.payer_bcbs_pct}%`}
          />
          <div
            className="bg-teal-500"
            style={{ flex: loc.payer_medicare_pct }}
            title={`Medicare ${loc.payer_medicare_pct}%`}
          />
          <div
            className="bg-amber-400"
            style={{ flex: loc.payer_commercial_pct }}
            title={`Commercial ${loc.payer_commercial_pct}%`}
          />
          <div
            className="bg-red-400"
            style={{ flex: loc.payer_medicaid_pct }}
            title={`Medicaid ${loc.payer_medicaid_pct}%`}
          />
          <div
            className="bg-gray-300"
            style={{ flex: wcVaPct }}
            title={`WC/VA ${wcVaPct}%`}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          B·M·C·Mcaid·WC
        </p>
      </TableCell>

      {/* BCBS % */}
      <TableCell className="text-sm tabular-nums text-blue-700">
        {loc.payer_bcbs_pct}%
      </TableCell>

      {/* Medicare % */}
      <TableCell className="text-sm tabular-nums text-teal-700">
        {loc.payer_medicare_pct}%
      </TableCell>

      {/* Commercial % */}
      <TableCell className="text-sm tabular-nums text-amber-700">
        {loc.payer_commercial_pct}%
      </TableCell>

      {/* Medicaid % — red if high */}
      <TableCell className={cn(
        'text-sm tabular-nums font-medium',
        highMedicaid ? 'text-red-600' : 'text-foreground'
      )}>
        {loc.payer_medicaid_pct}%
        {highMedicaid && (
          <span className="ml-1 text-[10px] text-red-500">↑</span>
        )}
      </TableCell>

      {/* WC + VA % */}
      <TableCell className="text-sm tabular-nums text-muted-foreground">
        {wcVaPct}%
      </TableCell>

      {/* Visit volume */}
      <TableCell className="text-sm tabular-nums">
        {loc.visits.toLocaleString()}
      </TableCell>

      {/* Estimated monthly revenue */}
      <TableCell className="text-sm tabular-nums font-medium">
        {loc.est_monthly_revenue.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })}
      </TableCell>
    </TableRow>
  )
}
