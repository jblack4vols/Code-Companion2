/**
 * Referral-to-Claims Linking — actual collected revenue per referral vs. estimates.
 * Gated to OWNER/DIRECTOR/ANALYST.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link2, ChevronLeft, ChevronRight } from "lucide-react";

interface Summary {
  totalReferrals: number;
  linkedReferrals: number;
  totalEstimated: number;
  totalCollected: number;
  accuracyGap: number;
}
interface LinkedRow {
  referralId: string;
  patientAccountNumber: string;
  patientFullName: string | null;
  physicianName: string | null;
  referralDate: string;
  valueEstimate: number | null;
  totalBilled: number;
  totalPaid: number;
  totalDenied: number;
  claimCount: number;
}

const fmt$ = (n: number) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const accuracyColor = (collected: number, estimated: number) =>
  collected > estimated ? "text-green-600" : collected < estimated ? "text-red-600" : "";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("Request failed");
  return r.json();
}

const PAGE_SIZE = 50;

export default function ReferralClaimsLinkingPage() {
  const [page, setPage] = useState(1);
  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ["/api/referral-claims/summary"],
    queryFn: () => getJson("/api/referral-claims/summary"),
  });
  const { data: linked, isLoading: linkedLoading } = useQuery<{ data: LinkedRow[]; total: number; page: number; pageSize: number }>({
    queryKey: ["/api/referral-claims/linked", page],
    queryFn: () => getJson(`/api/referral-claims/linked?page=${page}&pageSize=${PAGE_SIZE}`),
  });
  const totalPages = linked ? Math.ceil(linked.total / PAGE_SIZE) : 0;

  const s = summary;
  const linkRate = s && s.totalReferrals > 0 ? Math.round((s.linkedReferrals / s.totalReferrals) * 100) : 0;
  const gapColor = s ? accuracyColor(s.totalCollected, s.totalEstimated) : "";

  const kpis = [
    { id: "linked", label: "Referrals with Claims", value: String(s?.linkedReferrals ?? 0), color: "" },
    { id: "link-rate", label: "Link Rate", value: `${linkRate}%`, color: "" },
    { id: "est-vs-collected", label: "Estimated vs Collected", value: `${fmt$(s?.totalEstimated ?? 0)} / ${fmt$(s?.totalCollected ?? 0)}`, color: gapColor },
    { id: "accuracy-gap", label: "Accuracy Gap", value: `${(s?.accuracyGap ?? 0) > 0 ? "+" : ""}${s?.accuracyGap ?? 0}%`, color: gapColor },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
          <Link2 className="w-6 h-6" /> Referral-to-Claims Linking
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Actual collected revenue per referral, matched by patient account number.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.id} data-testid={`card-kpi-${k.id}`}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? <Skeleton className="h-8 w-24" /> : (
                <div className={`text-xl font-bold ${k.color}`} data-testid={`text-kpi-${k.id}`}>{k.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Referrals and Linked Claims</CardTitle></CardHeader>
        <CardContent>
          {linkedLoading ? <Skeleton className="h-40 w-full" /> : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Physician</TableHead>
                  <TableHead>Referral Date</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Claims</TableHead>
                  <TableHead className="text-right">Denied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(linked?.data ?? []).map(r => (
                  <TableRow key={r.referralId} data-testid={`row-referral-${r.referralId}`}>
                    <TableCell className="font-medium">{r.patientFullName || r.patientAccountNumber}</TableCell>
                    <TableCell>{r.physicianName || "—"}</TableCell>
                    <TableCell>{r.referralDate}</TableCell>
                    <TableCell className="text-right">{r.valueEstimate != null ? fmt$(r.valueEstimate) : "—"}</TableCell>
                    <TableCell className="text-right">{fmt$(r.totalBilled)}</TableCell>
                    <TableCell className={`text-right font-medium ${r.claimCount > 0 && r.valueEstimate != null ? accuracyColor(r.totalPaid, r.valueEstimate) : ""}`}>
                      {fmt$(r.totalPaid)}
                    </TableCell>
                    <TableCell className="text-right">{r.claimCount}</TableCell>
                    <TableCell className="text-right">
                      {r.totalDenied > 0 ? <Badge variant="destructive">{r.totalDenied}</Badge> : 0}
                    </TableCell>
                  </TableRow>
                ))}
                {(linked?.data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No referrals with account numbers found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4" data-testid="pagination">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, linked?.total ?? 0)} of {linked?.total ?? 0}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev">
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next">
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
