import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Phone } from "lucide-react";

function getUrgency(expDate: string) {
  const daysLeft = Math.ceil((new Date(expDate).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return { label: "Expired", color: "bg-red-100 text-red-800", days: daysLeft };
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, color: "bg-red-100 text-red-800", days: daysLeft };
  if (daysLeft <= 14) return { label: `${daysLeft}d left`, color: "bg-orange-100 text-orange-800", days: daysLeft };
  return { label: `${daysLeft}d left`, color: "bg-yellow-100 text-yellow-800", days: daysLeft };
}

export default function AuthExpirationAlertsPage() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/referrals/expiring-auths"],
    queryFn: () => fetch("/api/referrals/expiring-auths?daysAhead=30", { credentials: "include" }).then(r => r.json()),
  });

  const items = (Array.isArray(data) ? data : []).map(r => {
    const urgency = getUrgency(r.authExpirationDate);
    const utilization = r.authorizedVisits ? Math.round(((r.arrivedVisits ?? 0) / r.authorizedVisits) * 100) : null;
    const remaining = r.authorizedVisits ? r.authorizedVisits - (r.arrivedVisits ?? 0) : null;
    return { ...r, urgency, utilization, remaining };
  }).sort((a, b) => a.urgency.days - b.urgency.days);

  const expired = items.filter(i => i.urgency.days < 0).length;
  const totalRemaining = items.reduce((sum, i) => sum + Math.max(i.remaining ?? 0, 0), 0);
  const withUtil = items.filter(i => i.utilization !== null);
  const avgUtil = withUtil.length > 0
    ? Math.round(withUtil.reduce((sum, i) => sum + i.utilization!, 0) / withUtil.length)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-auth-expiration-alerts">
      <div>
        <h1 className="text-2xl font-bold">Authorization Expiration Alerts</h1>
        <p className="text-muted-foreground">Patients with authorizations expiring soon — prioritize outreach to recover visits</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Expiring (30d)</div>
            <div className="text-3xl font-bold" data-testid="text-expiring-count">{isLoading ? <Skeleton className="h-9 w-16" /> : items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Expired</div>
            <div className="text-3xl font-bold text-red-600" data-testid="text-expired-count">{isLoading ? <Skeleton className="h-9 w-16" /> : expired}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Visits at Risk</div>
            <div className="text-3xl font-bold text-orange-600" data-testid="text-visits-at-risk">{isLoading ? <Skeleton className="h-9 w-16" /> : totalRemaining}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Avg Utilization</div>
            <div className="text-3xl font-bold" data-testid="text-avg-utilization">{isLoading ? <Skeleton className="h-9 w-16" /> : `${avgUtil}%`}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Outreach List</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : items.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No expiring authorizations</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Auth #</TableHead>
                  <TableHead>Visits Used</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Insurance</TableHead>
                  <TableHead>Therapist</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(r => (
                  <TableRow key={r.id} data-testid={`row-auth-${r.id}`}>
                    <TableCell><Badge className={r.urgency.color}>{r.urgency.label}</Badge></TableCell>
                    <TableCell className="font-medium">{r.patientFullName || r.patientAccountNumber || "—"}</TableCell>
                    <TableCell>{r.patientPhone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.patientPhone}</span> : "—"}</TableCell>
                    <TableCell>{r.authNumber || "—"}</TableCell>
                    <TableCell>{r.arrivedVisits ?? 0} / {r.authorizedVisits ?? "—"}</TableCell>
                    <TableCell className="font-semibold">{r.remaining ?? "—"}</TableCell>
                    <TableCell>
                      {r.utilization !== null ? (
                        <Badge className={r.utilization < 50 ? "bg-red-100 text-red-800" : r.utilization < 75 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}>
                          {r.utilization}%
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{new Date(r.authExpirationDate).toLocaleDateString()}</TableCell>
                    <TableCell>{r.primaryInsurance || "—"}</TableCell>
                    <TableCell>{r.caseTherapist || "—"}</TableCell>
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
