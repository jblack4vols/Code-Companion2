import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, Building2, Star } from "lucide-react";

interface PhysiciansFiltersProps {
  search: string;
  statusFilter: string;
  stageFilter: string;
  priorityFilter: string;
  practiceFilter: string;
  showFavoritesOnly: boolean;
  hasActiveFilters: boolean;
  onSearchChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onStageChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
  onClearPracticeFilter: () => void;
  onToggleFavorites: () => void;
  onClearFilters: () => void;
}

export function PhysiciansFilters({
  search, statusFilter, stageFilter, priorityFilter, practiceFilter,
  showFavoritesOnly, hasActiveFilters,
  onSearchChange, onStatusChange, onStageChange, onPriorityChange,
  onClearPracticeFilter, onToggleFavorites, onClearFilters,
}: PhysiciansFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search name, practice, NPI..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
          data-testid="input-search-physicians"
        />
      </div>
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[130px]" data-testid="select-filter-status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="PROSPECT">Prospect</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="INACTIVE">Inactive</SelectItem>
        </SelectContent>
      </Select>
      <Select value={stageFilter} onValueChange={onStageChange}>
        <SelectTrigger className="w-[140px]" data-testid="select-filter-stage">
          <SelectValue placeholder="Stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Stages</SelectItem>
          <SelectItem value="NEW">New</SelectItem>
          <SelectItem value="DEVELOPING">Developing</SelectItem>
          <SelectItem value="STRONG">Strong</SelectItem>
          <SelectItem value="AT_RISK">At Risk</SelectItem>
        </SelectContent>
      </Select>
      <Select value={priorityFilter} onValueChange={onPriorityChange}>
        <SelectTrigger className="w-[130px]" data-testid="select-filter-priority">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
        </SelectContent>
      </Select>
      {practiceFilter && (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Building2 className="w-3 h-3" />
          {practiceFilter}
          <button onClick={onClearPracticeFilter} className="ml-1" data-testid="button-clear-practice-filter">
            <X className="w-3 h-3" />
          </button>
        </Badge>
      )}
      <Button
        variant={showFavoritesOnly ? "default" : "outline"}
        size="sm"
        onClick={onToggleFavorites}
        data-testid="button-toggle-favorites"
        className="gap-1"
      >
        <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-current" : ""}`} />
        My Providers
      </Button>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} data-testid="button-clear-filters">
          <X className="w-3 h-3 mr-1" />Clear
        </Button>
      )}
    </div>
  );
}
