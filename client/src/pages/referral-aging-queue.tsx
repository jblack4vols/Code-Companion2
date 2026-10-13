import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, AlertTriangle, Phone } from "lucide-react";

function getAgingBucket(referralDate: string) {
  const hours = (Date.now() - new Date(referralDate).getTime()) / 3600000;
  if (hours < 24) return { label: "< 24h", color: "bg-green-100 text-green-800", priority: 1 };
  if (hours < 48) return { label: "24-48h", color: "bg-yellow-100 text-yellow-800", priority: 2 };
  if (hours < 72) return { label: "48-72h", color: "bg-orange-100 text-orange-800", priority: 3 };
  return { label: `${Math.floor(hours / 24)}d`, color: "bg-red-100 text-red-800", priority: 4 };
}

export default function ReferralAgingQueuePage() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/referrals/aging-queue"],
    queryFn: () => fetch("/api/referrals/aging-queue", { credentials: "include" }).then(r => r.json()),
  });

  const sorted = (Array.isArray(data) ? data : [])
    .map(r => ({ ...r, bucket: getAgingBucket(r.referralDate) }))
    .sort((a, b) => b.bucket.priority - a.bucket.priority || new Date(a.referralDate).getTime() - new Date(b.referralDate).getTime());

  const critical = sorted.filter(r => r.bucket.priority >= 3).length;
  const total = sorted.length;
  const avgAge = total > 0
    ? Math.round(sorted.reduce((sum, r) => sum + (Date.now() - new Date(r.referralDate).getTime()) / 86400000, 0) / total)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-referral-aging-queue">
      <div>
        <h1 className="text-2xl font-bold">Unscheduled Referral Aging Queue</h1>
        <p className="text-muted-foreground">Referrals received but not yet scheduled — sorted by urgency</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Unscheduled</div>
            <div className="text-3xl font-bold" data-testid="text-total-unscheduled">{isLoading ? <Skeleton className="h-9 w-16" /> : total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-red-500" /> Critical (48h+)</div>
            <div className="text-3xl font-bold text-red-600" data-testid="text-critical-count">{isLoading ? <Skeleton className="h-9 w-16" /> : critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-4 w-4" /> Avg Age (days)</div>
            <div className="text-3xl font-bold" data-testid="text-avg-age">{isLoading ? <Skeleton className="h-9 w-16" /> : avgAge}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Call List</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No unscheduled referrals — great job!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Referral Date</TableHead>
                  <TableHead>Referring Provider</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead>Est. Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(r => (
                  <TableRow key={r.id} data-testid={`row-aging-${r.id}`}>
                    <TableCell><Badge className={r.bucket.color}>{r.bucket.label}</Badge></TableCell>
                    <TableCell className="font-medium">{r.patientFullName || r.patientAccountNumber || "—"}</TableCell>
                    <TableCell>{r.patientPhone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.patientPhone}</span> : "—"}</TableCell>
                    <TableCell>{new Date(r.referralDate).toLocaleDateString()}</TableCell>
                    <TableCell>{r.referringProviderName || "—"}</TableCell>
                    <TableCell>{r.primaryInsurance || "—"}</TableCell>
                    <TableCell>{r.valueEstimate ? `$${Number(r.valueEstimate).toLocaleString()}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
