import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Plus, X, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { Referral } from "@shared/schema";

type ReferralRow = Referral & { physicianFirstName?: string; physicianLastName?: string; physicianCredentials?: string; locationName?: string };

const statusBadge: Record<string, string> = {
  RECEIVED: "bg-chart-1/15 text-chart-1",
  SCHEDULED: "bg-chart-3/15 text-chart-3",
  EVAL_COMPLETED: "bg-chart-2/15 text-chart-2",
  DISCHARGED: "bg-chart-4/15 text-chart-4",
  LOST: "bg-chart-5/15 text-chart-5",
};

interface ReferralsTableProps {
  referrals: ReferralRow[];
  isLoading: boolean;
  isError: boolean;
  isOwner: boolean;
  canCreate: boolean;
  hasActiveFilters: boolean;
  selectedIds: Set<string>;
  sortBy: string;
  sortDir: string;
  page: number;
  totalPages: number;
  total: number;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (r: ReferralRow) => void;
  onToggleSort: (col: string) => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onAddNew: () => void;
  onPageChange: (p: number) => void;
}

export function ReferralsTable({
  referrals, isLoading, isError, isOwner, canCreate, hasActiveFilters,
  selectedIds, sortBy, sortDir, page, totalPages, total,
  onToggleSelect, onToggleSelectAll, onRowClick, onToggleSort,
  onRetry, onClearFilters, onAddNew, onPageChange,
}: ReferralsTableProps) {
  const SortIcon = ({ col }: { col: string }) =>
    sortBy === col
      ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
      : <ArrowUpDown className="w-3 h-3 opacity-30" />;

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground mb-3" data-testid="text-referrals-error">Failed to load referrals</p>
              <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry-referrals">Retry</Button>
            </div>
          ) : referrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No referrals found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {hasActiveFilters ? "Try adjusting your filters" : "Get started by adding your first referral"}
              </p>
              <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={onClearFilters} data-testid="button-empty-clear-referral-filters">
                    <X className="w-3 h-3 mr-1.5" />Clear Filters
                  </Button>
                )}
                {canCreate && (
                  <Button size="sm" onClick={onAddNew} data-testid="button-empty-add-referral">
                    <Plus className="w-4 h-4 mr-1.5" />New Referral
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isOwner && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={referrals.length > 0 && selectedIds.size === referrals.length}
                          onCheckedChange={onToggleSelectAll}
                          aria-label="Select all"
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                    )}
                    <TableHead className="cursor-pointer select-none" onClick={() => onToggleSort("referralDate")} data-testid="sort-referralDate">
                      <span className="inline-flex items-center gap-1">Created <SortIcon col="referralDate" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => onToggleSort("patientFullName")} data-testid="sort-patientFullName">
                      <span className="inline-flex items-center gap-1">Patient <SortIcon col="patientFullName" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => onToggleSort("referringProviderName")} data-testid="sort-referringProviderName">
                      <span className="inline-flex items-center gap-1">Referring Doctor <SortIcon col="referringProviderName" /></span>
                    </TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => onToggleSort("status")} data-testid="sort-status">
                      <span className="inline-flex items-center gap-1">Status <SortIcon col="status" /></span>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Disc.</TableHead>
                    <TableHead className="hidden md:table-cell">Diagnosis</TableHead>
                    <TableHead className="hidden lg:table-cell">Therapist</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Visits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((r) => (
                    <TableRow key={r.id} className="hover-elevate cursor-pointer" onClick={() => onRowClick(r)} data-testid={`row-referral-${r.id}`}>
                      {isOwner && (
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => onToggleSelect(r.id)}
                            aria-label={`Select referral ${r.patientFullName || r.id}`}
                            data-testid={`checkbox-referral-${r.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.referralDate + "T00:00:00"), "MM/dd/yy")}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium" data-testid={`text-patient-name-${r.id}`}>{r.patientFullName || r.patientInitialsOrAnonId || "-"}</p>
                          {r.patientAccountNumber && <p className="text-[10px] text-muted-foreground">{r.patientAccountNumber}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.physicianFirstName ? `${r.physicianFirstName} ${r.physicianLastName}` : "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.locationName?.replace("Tristar PT - ", "") || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusBadge[r.status]}`}>{r.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        {r.discipline && <Badge variant="outline" className="text-[10px]">{r.discipline}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[180px] truncate">{r.diagnosisCategory || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{r.caseTherapist || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell text-right">
                        {r.arrivedVisits || 0}/{r.scheduledVisits || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" data-testid="text-referral-count">{total} referrals</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="button-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="text-page-info">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} data-testid="button-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
