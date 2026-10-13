/**
 * Multi-user calendar filter — horizontal row of user chips.
 * Click a chip to toggle that user's events on/off.
 * Colors cycle through chart-1..chart-5 CSS variables.
 */
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

interface UserBasic {
  id: string;
  name: string;
}

// chart-1 through chart-5 tailwind bg + text pairs (filled + outline variants)
const USER_CHIP_COLORS = [
  { filled: "bg-chart-1 text-white border-chart-1", outline: "bg-chart-1/10 text-chart-1 border-chart-1/40", dot: "bg-chart-1" },
  { filled: "bg-chart-2 text-white border-chart-2", outline: "bg-chart-2/10 text-chart-2 border-chart-2/40", dot: "bg-chart-2" },
  { filled: "bg-chart-3 text-white border-chart-3", outline: "bg-chart-3/10 text-chart-3 border-chart-3/40", dot: "bg-chart-3" },
  { filled: "bg-chart-4 text-white border-chart-4", outline: "bg-chart-4/10 text-chart-4 border-chart-4/40", dot: "bg-chart-4" },
  { filled: "bg-chart-5 text-white border-chart-5", outline: "bg-chart-5/10 text-chart-5 border-chart-5/40", dot: "bg-chart-5" },
];

export function getUserColor(index: number) {
  return USER_CHIP_COLORS[index % USER_CHIP_COLORS.length];
}

interface CalendarUserFilterProps {
  /** Currently selected user IDs. Empty set = all selected. */
  selectedUserIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}

export function CalendarUserFilter({ selectedUserIds, onChange }: CalendarUserFilterProps) {
  const { data: users } = useQuery<UserBasic[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  if (!users || users.length === 0) return null;

  // All selected = empty set (default). Flip: if clicking the only selected
  // user chip, restore "all".
  const allSelected = selectedUserIds.size === 0;

  function toggle(userId: string) {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
      // If nothing left, revert to "all"
      onChange(next.size === 0 ? new Set() : next);
    } else {
      // When switching from "all" state, deselect everyone else first
      if (allSelected) {
        onChange(new Set([userId]));
      } else {
        next.add(userId);
        // If all users are now selected, collapse back to "all"
        onChange(next.size === (users?.length ?? 0) ? new Set() : next);
      }
    }
  }

  function selectAll() {
    onChange(new Set());
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="calendar-user-filter">
      {/* "All" chip */}
      <button
        type="button"
        onClick={selectAll}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          allSelected
            ? "bg-foreground text-background border-foreground"
            : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
        }`}
        data-testid="chip-user-all"
      >
        All
      </button>

      {users.map((u, i) => {
        const color = getUserColor(i);
        const active = !allSelected && selectedUserIds.has(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active ? color.filled : color.outline
            }`}
            data-testid={`chip-user-${u.id}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot} ${active ? "opacity-100" : "opacity-70"}`} />
            {u.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Build a map of userId → color index so event cards can be colored consistently.
 */
export function buildUserColorMap(users: UserBasic[]): Map<string, number> {
  const map = new Map<string, number>();
  users.forEach((u, i) => map.set(u.id, i));
  return map;
}
