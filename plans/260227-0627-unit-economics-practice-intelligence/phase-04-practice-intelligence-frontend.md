# Phase 4: Practice Intelligence Frontend

## Context Links
- Backend endpoints: `phase-02-practice-intelligence-backend.md`
- Existing page pattern: `client/src/pages/provider-offices.tsx` (similar list+detail)
- Existing page pattern: `client/src/pages/executive-dashboard.tsx` (query + table + charts)
- Routing: `client/src/App.tsx` lines 72-107
- Sidebar: `client/src/components/app-sidebar.tsx`
- Query client: `client/src/lib/queryClient.ts`
- UI components: `client/src/components/ui/`

## Overview
- **Priority:** P2
- **Status:** pending
- **Description:** Single React page with two views: practice list (sortable table) and practice detail (physician cards with metrics). Uses the `/api/practices` and `/api/practices/:name/detail` endpoints.

## Key Insights
- Codebase uses `wouter` for routing (not react-router). `useLocation()` for navigation, `<Route path="...">` in App.tsx.
- TanStack Query with default `queryFn` that fetches `queryKey.join("/")` -- so `queryKey: ["/api/practices"]` auto-fetches.
- For custom query params, use explicit `queryFn` with `fetch()` (see `executive-dashboard.tsx` line 50-57).
- shadcn/ui Table, Card, Badge, Button, Skeleton, Select are available.
- Recharts for charts. `date-fns` for formatting.
- Existing `provider-offices.tsx` uses inline detail expansion (Collapsible). Practice Intelligence should use route-based detail view for richer UX.

## Architecture

```
/practices                          /practices/:name
+---------------------------------+  +----------------------------------+
| Practice List                   |  | Practice Detail                  |
| +-----------------------------+ |  | +------------------------------+ |
| | Search + Sort controls      | |  | | Practice Header (name, stats)| |
| +-----------------------------+ |  | +------------------------------+ |
| | Sortable Table              | |  | | Physician Cards Grid         | |
| | - Practice Name             | |  | | +----------+ +----------+   | |
| | - # Physicians              | |  | | | Dr. Smith| | Dr. Jones|   | |
| | - Total Referrals           | |  | | | 42 refs  | | 28 refs  |   | |
| | - Revenue                   | |  | | | $125K    | | $87K     |   | |
| | - Arrival Rate              | |  | | +----------+ +----------+   | |
| | - Last Interaction          | |  | +------------------------------+ |
| +-----------------------------+ |  +----------------------------------+
| Pagination                      |
+---------------------------------+
```

## Related Code Files

### Files to Create
- `client/src/pages/practice-intelligence.tsx` -- main page with list + detail views

### Files to Modify
- `client/src/App.tsx` -- add Route entries
- `client/src/components/app-sidebar.tsx` -- add nav items

## Implementation Steps

### Step 1: Create Page Component

Create `client/src/pages/practice-intelligence.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Users, FileText, DollarSign, TrendingUp,
  ArrowUpDown, ChevronLeft, Activity, Clock,
} from "lucide-react";

function formatCurrency(value: number): string {
  return "$" + value.toLocaleString("en-US", {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}
```

#### Practice List View

```tsx
function PracticeListView() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("totalReferrals");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/practices", { search, sortBy, sortOrder, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams({
        search, sortBy, sortOrder,
        page: String(page), pageSize: String(pageSize),
      });
      const res = await fetch(`/api/practices?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch practices");
      return res.json();
    },
  });

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const practices = data?.data || [];
  const totalPages = data?.totalPages || 1;

  // ... render search input, sortable table headers, rows with click to navigate
  // Each row: navigate(`/practices/${encodeURIComponent(p.practiceName)}`)
  // Pagination controls at bottom
}
```

**Table columns:**
1. Practice Name (sortable)
2. City/State
3. Physicians (sortable: physicianCount)
4. Total Referrals (sortable)
5. Revenue (sortable: totalRevenue)
6. Arrival Rate (sortable)
7. Last Interaction (sortable: lastInteractionAt)

**Row click** navigates to `/practices/:name`.

#### Practice Detail View

```tsx
function PracticeDetailView({ practiceName }: { practiceName: string }) {
  const [, navigate] = useLocation();
  const decodedName = decodeURIComponent(practiceName);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/practices", decodedName, "detail"],
    queryFn: async () => {
      const res = await fetch(
        `/api/practices/${encodeURIComponent(decodedName)}/detail`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch practice detail");
      return res.json();
    },
  });

  const practice = data?.practice;
  const physicians = data?.physicians || [];

  // Render:
  // 1. Back button (<ChevronLeft /> + "Back to Practices")
  // 2. Practice header card: name, city/state, summary stats (4 metric cards)
  // 3. Physician cards grid (2-3 columns)
  //    Each card: name, credentials, specialty, status badge,
  //    referral count, revenue, arrival rate, last interaction,
  //    interaction count, link to scorecard
}
```

**Physician card layout:**
```
+-------------------------------------------+
| Dr. John Smith, MD          [ACTIVE badge] |
| Orthopedic Surgery                         |
| ----------------------------------------- |
| 42 Referrals   $125,430 Revenue            |
| 78.5% Arrival  12 Interactions             |
| Last: Jan 15, 2026                         |
| [View Scorecard ->]                        |
+-------------------------------------------+
```

#### Main Export

```tsx
export default function PracticeIntelligencePage() {
  const [match, params] = useRoute("/practices/:name");

  if (match && params?.name) {
    return <PracticeDetailView practiceName={params.name} />;
  }
  return <PracticeListView />;
}
```

### Step 2: Add Routes in App.tsx

In `client/src/App.tsx`, add imports and routes:

```tsx
import PracticeIntelligencePage from "@/pages/practice-intelligence";

// Inside <Switch>:
<Route path="/practices" component={PracticeIntelligencePage} />
<Route path="/practices/:name" component={PracticeIntelligencePage} />
```

### Step 3: Add Sidebar Nav Item

In `client/src/components/app-sidebar.tsx`, add to the appropriate nav group (near "Provider Offices"):

```tsx
{
  title: "Practice Intelligence",
  url: "/practices",
  icon: Building2,
}
```

## Todo List

- [ ] Create `client/src/pages/practice-intelligence.tsx`
- [ ] Implement `PracticeListView` with search, sort, pagination
- [ ] Implement `PracticeDetailView` with summary cards + physician grid
- [ ] Add routes in `client/src/App.tsx`
- [ ] Add sidebar nav item in `app-sidebar.tsx`
- [ ] Verify page renders with no TypeScript errors
- [ ] Test search, sort, pagination, and drill-down navigation

## Success Criteria

- Practice list loads and displays all practices with metrics
- Clicking a practice row navigates to detail view
- Detail view shows practice summary + physician cards
- Physician cards link to existing scorecard page
- Search filters by practice name / city
- All sort columns work in both directions
- Back button returns to list view
- Loading skeletons shown during data fetch
- Responsive layout (cards wrap on smaller screens)

## Risk Assessment

- **Encoded practice names in URL**: Practice names with special characters (`&`, `/`) must be properly encoded/decoded. Use `encodeURIComponent` / `decodeURIComponent`.
- **Large practices**: Some practices may have 50+ physicians. Detail view should handle gracefully (scroll, no pagination needed for physician cards at this scale).

## Security Considerations

- `requireAuth` on backend; page should handle 401 by redirecting to login (handled by query client default behavior)
- No sensitive financial data exposed on this page beyond referral revenue (already visible on existing dashboards)
