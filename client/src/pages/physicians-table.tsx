import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Stethoscope, Plus, X, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Star, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import type { Physician, User } from "@shared/schema";

type SortField = "name" | "location" | "status" | "stage" | "priority" | "referrals";
type PhysicianWithCount = Physician & { referralCount?: number };

const stageBadge: Record<string, string> = { NEW: "bg-chart-1/15 text-chart-1", DEVELOPING: "bg-chart-3/15 text-chart-3", STRONG: "bg-chart-4/15 text-chart-4", AT_RISK: "bg-chart-5/15 text-chart-5" };
const priorityBadge: Record<string, string> = { LOW: "bg-muted text-muted-foreground", MEDIUM: "bg-chart-3/15 text-chart-3", HIGH: "bg-chart-5/15 text-chart-5" };
const statusBadge: Record<string, string> = { PROSPECT: "bg-chart-1/15 text-chart-1", ACTIVE: "bg-chart-4/15 text-chart-4", INACTIVE: "bg-muted text-muted-foreground" };

interface PhysiciansTableProps {
  physicians: PhysicianWithCount[];
  users: User[] | undefined;
  favoriteIds: string[];
  isLoading: boolean;
  isError: boolean;
  canCreate: boolean;
  canBulkAction: boolean;
  hasActiveFilters: boolean;
  selectedIds: Set<string>;
  sortBy: SortField | "";
  sortOrder: string;
  page: number;
  totalPages: number;
  total: number;
  isFavoritePending: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleFavorite: (id: string) => void;
  onSetPractice: (name: string) => void;
  onQuickInteraction: (p: PhysicianWithCount) => void;
  onSort: (field: SortField) => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onAddNew: () => void;
  onPageChange: (p: number) => void;
}

function SortableHead({ label, field, currentSort, currentOrder, onSort, className }: { label: string; field: SortField; currentSort: SortField | ""; currentOrder: string; onSort: (f: SortField) => void; className?: string }) {
  const active = currentSort === field;
  return (
    <TableHead className={`cursor-pointer select-none ${className || ""}`} onClick={() => onSort(field)} data-testid={`sort-${field}`}>
      <div className="flex items-center gap-1">
        {label}
        {active ? (currentOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />}
      </div>
    </TableHead>
  );
}

export function PhysiciansTable({ physicians, users, favoriteIds, isLoading, isError, canCreate, canBulkAction, hasActiveFilters, selectedIds, sortBy, sortOrder, page, totalPages, total, isFavoritePending, onToggleSelect, onToggleSelectAll, onToggleFavorite, onSetPractice, onQuickInteraction, onSort, onRetry, onClearFilters, onAddNew, onPageChange }: PhysiciansTableProps) {
  return (
    <>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Stethoscope className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground mb-3" data-testid="text-physicians-error">Failed to load referring providers</p>
              <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry-physicians">Retry</Button>
            </div>
          ) : physicians.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Stethoscope className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No referring providers found</p>
              <p className="text-xs text-muted-foreground mt-1">{hasActiveFilters ? "Try adjusting your search or filters" : "Get started by adding your first referring provider"}</p>
              <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
                {hasActiveFilters && <Button variant="outline" size="sm" onClick={onClearFilters} data-testid="button-empty-clear-filters"><X className="w-3 h-3 mr-1.5" />Clear Filters</Button>}
                {canCreate && <Button size="sm" onClick={onAddNew} data-testid="button-empty-add-physician"><Plus className="w-4 h-4 mr-1.5" />Add Referring Provider</Button>}
              </div>
            </div>
          ) : (
            <>
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 px-1"><Star className="w-3.5 h-3.5 text-muted-foreground" /></TableHead>
                      {canBulkAction && <TableHead className="w-10"><Checkbox checked={physicians.length > 0 && selectedIds.size === physicians.length} onCheckedChange={onToggleSelectAll} aria-label="Select all" data-testid="checkbox-select-all" /></TableHead>}
                      <SortableHead label="Provider" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="min-w-[180px]" />
                      <TableHead className="min-w-[100px]">NPI</TableHead>
                      <TableHead>Office/Practice Name</TableHead>
                      <SortableHead label="Location" field="location" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
                      <SortableHead label="Status" field="status" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
                      <SortableHead label="Stage" field="stage" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
                      <SortableHead label="Priority" field="priority" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
                      <SortableHead label="Referrals" field="referrals" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} />
                      {canCreate && <TableHead className="w-10"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {physicians.map((p) => {
                      const owner = users?.find(u => u.id === p.assignedOwnerId);
                      return (
                        <TableRow key={p.id} className="hover-elevate cursor-pointer" data-testid={`row-physician-${p.id}`}>
                          <TableCell className="w-8 px-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggleFavorite(p.id)} disabled={isFavoritePending} aria-label={favoriteIds.includes(p.id) ? `Remove Dr. ${p.firstName} ${p.lastName} from favorites` : `Add Dr. ${p.firstName} ${p.lastName} to favorites`} data-testid={`button-favorite-${p.id}`}>
                              <Star className={`w-4 h-4 ${favoriteIds.includes(p.id) ? "fill-chart-4 text-chart-4" : "text-muted-foreground/40"}`} />
                            </Button>
                          </TableCell>
                          {canBulkAction && <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => onToggleSelect(p.id)} aria-label={`Select ${p.firstName} ${p.lastName}`} data-testid={`checkbox-physician-${p.id}`} /></TableCell>}
                          <TableCell>
                            <Link href={`/physicians/${p.id}`} className="block">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">{p.firstName[0]}{p.lastName[0]}</div>
                                <div>
                                  <p className="text-sm font-medium" data-testid={`text-physician-name-${p.id}`}>{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                                  {owner && <p className="text-xs text-muted-foreground">{owner.name}</p>}
                                </div>
                              </div>
                            </Link>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground" data-testid={`text-physician-npi-${p.id}`}>{p.npi || "-"}</TableCell>
                          <TableCell className="text-sm">
                            {p.practiceName ? <button type="button" className="text-left hover:underline text-primary/80 cursor-pointer" onClick={(e) => { e.stopPropagation(); onSetPractice(p.practiceName!); }} data-testid={`link-practice-${p.id}`}>{p.practiceName}</button> : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{[p.city, p.state].filter(Boolean).join(", ") || "-"}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${statusBadge[p.status]}`}>{p.status}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${stageBadge[p.relationshipStage ?? "NEW"]}`}>{p.relationshipStage?.replace("_", " ") ?? "—"}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${priorityBadge[p.priority]}`}>{p.priority}</Badge></TableCell>
                          <TableCell className="text-sm text-center" data-testid={`text-referral-count-${p.id}`}>
                            {Number(p.referralCount) > 0 ? <Badge variant="secondary" className="text-[10px]">{Number(p.referralCount)}</Badge> : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          {canCreate && <TableCell onClick={(e) => e.stopPropagation()}><Button size="icon" variant="ghost" onClick={() => onQuickInteraction(p)} aria-label={`Log interaction with Dr. ${p.firstName} ${p.lastName}`} data-testid={`button-quick-interaction-${p.id}`}><MessageSquare className="w-4 h-4" /></Button></TableCell>}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="sm:hidden divide-y">
                {physicians.map((p) => (
                  <div key={p.id} className="p-3 hover-elevate" data-testid={`card-physician-mobile-${p.id}`}>
                    <Link href={`/physicians/${p.id}`} className="block">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-medium shrink-0">{p.firstName[0]}{p.lastName[0]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ""}</p>
                          {p.practiceName && <p className="text-xs text-muted-foreground truncate">{p.practiceName}</p>}
                          <p className="text-xs text-muted-foreground">{[p.city, p.state].filter(Boolean).join(", ") || "-"}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] ${statusBadge[p.status]}`}>{p.status}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${stageBadge[p.relationshipStage ?? "NEW"]}`}>{p.relationshipStage?.replace("_", " ") ?? "—"}</Badge>
                            {Number(p.referralCount) > 0 && <Badge variant="secondary" className="text-[10px]">{Number(p.referralCount)} referrals</Badge>}
                          </div>
                        </div>
                        {canCreate && <Button size="icon" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickInteraction(p); }} aria-label={`Log interaction with Dr. ${p.firstName} ${p.lastName}`} data-testid={`button-quick-interaction-mobile-${p.id}`}><MessageSquare className="w-4 h-4" /></Button>}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" data-testid="text-physician-count">{total} providers</p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} data-testid="button-prev-page"><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-xs text-muted-foreground" data-testid="text-page-info">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} data-testid="button-next-page"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    </>
  );
}
