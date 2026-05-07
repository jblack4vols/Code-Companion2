import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, X, Stethoscope, ChevronsUpDown } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { apiRequest } from "@/lib/queryClient";
import type { Location, Physician } from "@shared/schema";

interface ReferralsFiltersProps {
  search: string;
  statusFilter: string;
  locationFilter: string;
  disciplineFilter: string;
  dateFrom: string;
  dateTo: string;
  physicianFilterId: string;
  physicianFilterLabel: string;
  locations: Location[] | undefined;
  hasActiveFilters: boolean;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onDisciplineChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onPhysicianFilterChange: (id: string, label: string) => void;
  onClearFilters: () => void;
}

export function ReferralsFilters({
  search,
  statusFilter,
  locationFilter,
  disciplineFilter,
  dateFrom,
  dateTo,
  physicianFilterId,
  physicianFilterLabel,
  locations,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onLocationChange,
  onDisciplineChange,
  onDateFromChange,
  onDateToChange,
  onPhysicianFilterChange,
  onClearFilters,
}: ReferralsFiltersProps) {
  const [physicianOpen, setPhysicianOpen] = useState(false);
  const [physicianSearch, setPhysicianSearch] = useState("");
  const debouncedPhysicianSearch = useDebounce(physicianSearch, 250);
  const [physicianResults, setPhysicianResults] = useState<Physician[]>([]);
  const lastQueryRef = useRef<string>("");

  useEffect(() => {
    if (!physicianOpen) return;
    const q = debouncedPhysicianSearch.trim();
    if (q.length < 2) {
      setPhysicianResults([]);
      return;
    }
    if (lastQueryRef.current === q) return;
    lastQueryRef.current = q;
    apiRequest("GET", `/api/physicians/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data: Physician[]) => setPhysicianResults(data ?? []))
      .catch(() => setPhysicianResults([]));
  }, [physicianOpen, debouncedPhysicianSearch]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search patient, doctor, therapist..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          data-testid="input-search-referrals"
        />
      </div>
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[150px]" data-testid="select-filter-referral-status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="RECEIVED">Received</SelectItem>
          <SelectItem value="SCHEDULED">Scheduled</SelectItem>
          <SelectItem value="EVAL_COMPLETED">Eval Completed</SelectItem>
          <SelectItem value="DISCHARGED">Discharged</SelectItem>
          <SelectItem value="LOST">Lost</SelectItem>
        </SelectContent>
      </Select>
      <Select value={locationFilter} onValueChange={onLocationChange}>
        <SelectTrigger className="w-[200px]" data-testid="select-filter-referral-location">
          <SelectValue placeholder="Facility" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Facilities</SelectItem>
          {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Popover open={physicianOpen} onOpenChange={setPhysicianOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[220px] justify-between font-normal"
            data-testid="button-filter-referring-provider"
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Stethoscope className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              {physicianFilterId ? (
                <span className="truncate">{physicianFilterLabel || "Selected provider"}</span>
              ) : (
                <span className="text-muted-foreground">Referring provider</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder="Search by name or NPI…"
              value={physicianSearch}
              onChange={(e) => setPhysicianSearch(e.target.value)}
              data-testid="input-filter-referring-provider-search"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {physicianFilterId && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm border-b text-muted-foreground hover:bg-accent flex items-center gap-2"
                onClick={() => { onPhysicianFilterChange("", ""); setPhysicianOpen(false); setPhysicianSearch(""); }}
                data-testid="button-clear-referring-provider"
              >
                <X className="w-3.5 h-3.5" />
                Clear filter
              </button>
            )}
            {physicianSearch.trim().length < 2 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                Type at least 2 characters to search.
              </p>
            )}
            {physicianSearch.trim().length >= 2 && physicianResults.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                No providers match.
              </p>
            )}
            {physicianResults.map((p) => {
              const label = `${p.firstName} ${p.lastName}${p.credentials ? `, ${p.credentials}` : ""}`;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex flex-col gap-0.5"
                  onClick={() => {
                    onPhysicianFilterChange(p.id, label);
                    setPhysicianOpen(false);
                    setPhysicianSearch("");
                  }}
                  data-testid={`option-referring-provider-${p.id}`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {p.practiceName || "—"}{p.npi ? ` · NPI ${p.npi}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Select value={disciplineFilter} onValueChange={onDisciplineChange}>
        <SelectTrigger className="w-[120px]" data-testid="select-filter-referral-discipline">
          <SelectValue placeholder="Discipline" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="PT">PT</SelectItem>
          <SelectItem value="OT">OT</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="w-[140px]"
          data-testid="input-filter-referral-date-from"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="w-[140px]"
          data-testid="input-filter-referral-date-to"
        />
      </div>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} data-testid="button-clear-referral-filters">
          <X className="w-3 h-3 mr-1" />Clear
        </Button>
      )}
    </div>
  );
}
