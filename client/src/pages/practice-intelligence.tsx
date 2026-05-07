import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Search, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Users, DollarSign,
  TrendingUp, Activity,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | undefined | null): string {
  if (value == null) return "$0";
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPercent(value: number | undefined | null): string {
  if (value == null) return "0.0%";
  return value.toFixed(1) + "%";
}

type SortOrder = "asc" | "desc";
type SortColumn =
  | "practiceName"
  | "city"
  | "physicianCount"
  | "totalReferrals"
  | "totalRevenue"
  | "arrivalRate"
  | "lastInteractionAt";

function SortIcon({ column, current, order }: { column: SortColumn; current: SortColumn; order: SortOrder }) {
  if (column !== current) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50 inline" />;
  return order === "asc"
    ? <ArrowUp className="ml-1 h-3 w-3 text-primary inline" />
    : <ArrowDown className="ml-1 h-3 w-3 text-primary inline" />;
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function statusBadgeClass(status: string): string {
  const s = status?.toUpperCase() ?? "";
  if (["ACTIVE", "A"].includes(s)) return "bg-chart-4/15 text-chart-4";
  if (["INACTIVE", "PROSPECT"].includes(s)) return "bg-chart-3/15 text-chart-3";
  return "bg-chart-5/15 text-chart-5";
}

// ---------------------------------------------------------------------------
// Practice List View
// ---------------------------------------------------------------------------

interface PracticeRow {
  practiceName: string;
  city: string | null;
  state: string | null;
  physicianCount: number;
  totalReferrals: number;
  totalRevenue: number;
  arrivalRate: number;
  lastInteractionAt: string | null;
}

interface PracticeListResponse {
  data: PracticeRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function PracticeListView() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortColumn>("totalReferrals");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  // Reset to page 1 when search or sort changes
  useEffect(() => { setPage(1); }, [debouncedSearch, sortBy, sortOrder]);

  const queryParams = new URLSearchParams({
    search: debouncedSearch,
    sortBy,
    sortOrder,
    page: page.toString(),
    pageSize: "25",
  }).toString();

  const { data: result, isLoading } = useQuery<PracticeListResponse>({
    queryKey: ["/api/practices", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/practices?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load practices");
      return res.json();
    },
  });

  const practices = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  function handleSort(col: SortColumn) {
    if (col === sortBy) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
  }

  function thProps(col: SortColumn) {
    return {
      className: "cursor-pointer select-none hover:text-foreground whitespace-nowrap",
      onClick: () => handleSort(col),
    };
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 data-testid="text-practices-title">
            Practice Intelligence
          </h1>
          <p className="page-subtitle">
            {total} practice{total !== 1 ? "s" : ""} tracked
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search practices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
          data-testid="input-search-practices"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : practices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">
                No practices found{search ? ` matching "${search}"` : ""}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead {...thProps("practiceName")}>
                      Practice Name <SortIcon column="practiceName" current={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead {...thProps("city")}>
                      City / State <SortIcon column="city" current={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead {...thProps("physicianCount")} className={thProps("physicianCount").className + " text-right"}>
                      Physicians <SortIcon column="physicianCount" current={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead {...thProps("totalReferrals")} className={thProps("totalReferrals").className + " text-right"}>
                      Total Referrals <SortIcon column="totalReferrals" current={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead {...thProps("totalRevenue")} className={thProps("totalRevenue").className + " text-right"}>
                      Revenue <SortIcon column="totalRevenue" current={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead {...thProps("arrivalRate")} className={thProps("arrivalRate").className + " text-right"}>
                      Arrival Rate <SortIcon column="arrivalRate" current={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead {...thProps("lastInteractionAt")}>
                      Last Interaction <SortIcon column="lastInteractionAt" current={sortBy} order={sortOrder} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {practices.map((p) => (
                    <TableRow
                      key={p.practiceName}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => {
                        window.location.href = `/practices/${encodeURIComponent(p.practiceName)}`;
                      }}
                      data-testid={`row-practice-${p.practiceName.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <TableCell className="font-medium text-primary">
                        {p.practiceName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="text-xs">{p.physicianCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{p.totalReferrals}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(p.totalRevenue)}</TableCell>
                      <TableCell className="text-right text-sm">{formatPercent(p.arrivalRate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(p.lastInteractionAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} practices)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice Detail View
// ---------------------------------------------------------------------------

interface PhysicianCard {
  id: number;
  firstName: string;
  lastName: string;
  credentials: string | null;
  specialty: string | null;
  status: string;
  referralCount: number;
  revenueGenerated: number;
  arrivalRate: number;
  interactionCount: number;
  lastInteractionAt: string | null;
}

interface PracticeDetail {
  practiceName: string;
  city: string | null;
  state: string | null;
  totalReferrals: number;
  totalRevenue: number;
  arrivalRate: number;
}

interface PracticeDetailResponse {
  practice: PracticeDetail;
  physicians: PhysicianCard[];
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PracticeDetailView({ practiceName }: { practiceName: string }) {
  const decoded = decodeURIComponent(practiceName);

  const { data, isLoading } = useQuery<PracticeDetailResponse>({
    queryKey: ["/api/practices", practiceName, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/practices/${encodeURIComponent(decoded)}/detail`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load practice detail");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-14" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    );
  }

  const practice = data?.practice;
  const physicians = data?.physicians ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/practices">
          <Button variant="outline" size="sm" data-testid="button-back-practices">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Practices
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-practice-name">{decoded}</h1>
          {practice && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              {[practice.city, practice.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Summary metrics */}
      {practice && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={Users} label="Total Physicians" value={String(physicians.length)} />
          <MetricCard icon={Activity} label="Total Referrals" value={String(practice.totalReferrals)} />
          <MetricCard icon={DollarSign} label="Total Revenue" value={formatCurrency(practice.totalRevenue)} />
          <MetricCard icon={TrendingUp} label="Avg Arrival Rate" value={formatPercent(practice.arrivalRate)} />
        </div>
      )}

      {/* Physicians grid */}
      <div>
        <h2 className="text-base font-semibold mb-3">Physicians</h2>
        {physicians.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No physicians in this practice</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {physicians.map((physician) => (
              <Card key={physician.id} className="hover:border-primary/40 transition-colors" data-testid={`card-physician-${physician.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {physician.lastName}, {physician.firstName}
                        {physician.credentials ? `, ${physician.credentials}` : ""}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {physician.specialty || "Unknown Specialty"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs shrink-0 ${statusBadgeClass(physician.status)}`}
                    >
                      {physician.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <p className="text-muted-foreground">Referrals</p>
                      <p className="font-medium">{physician.referralCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-medium">{formatCurrency(physician.revenueGenerated)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Arrival Rate</p>
                      <p className="font-medium">{formatPercent(physician.arrivalRate)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Interactions</p>
                      <p className="font-medium">{physician.interactionCount}</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    Last interaction: {formatDate(physician.lastInteractionAt)}
                  </div>
                  <Link href={`/scorecard/${physician.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs h-7" data-testid={`link-scorecard-${physician.id}`}>
                      View Scorecard
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export — route-based switcher
// ---------------------------------------------------------------------------

export default function PracticeIntelligencePage() {
  const [match, params] = useRoute("/practices/:name");
  if (match && params?.name) {
    return <PracticeDetailView practiceName={params.name} />;
  }
  return <PracticeListView />;
}
