import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import type { Location } from "@shared/schema";

interface ReferralsFiltersProps {
  search: string;
  statusFilter: string;
  locationFilter: string;
  disciplineFilter: string;
  dateFrom: string;
  dateTo: string;
  locations: Location[] | undefined;
  hasActiveFilters: boolean;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onDisciplineChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onClearFilters: () => void;
}

export function ReferralsFilters({
  search,
  statusFilter,
  locationFilter,
  disciplineFilter,
  dateFrom,
  dateTo,
  locations,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onLocationChange,
  onDisciplineChange,
  onDateFromChange,
  onDateToChange,
  onClearFilters,
}: ReferralsFiltersProps) {
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
