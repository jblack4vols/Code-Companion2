# UI/UX Design Audit Report

**Date:** 2026-02-27
**Scope:** Healthcare CRM visual polish, layout consistency, modern design patterns
**Files Modified:** 8 files, 0 new files created

---

## Audit Findings

### Issues Identified (Priority Order)

1. **Inconsistent page headers** -- Dashboard, Physicians, Referrals, Executive, Unit Economics, Practice Intelligence all used different header patterns (flex-wrap vs flex, different gap values, inline font sizes vs inconsistent classes)
2. **Table header contrast** -- Headers blended with body rows; no visual distinction between `thead` and `tbody`
3. **No table row striping** -- Large data tables (physicians, referrals, exec top-20) lacked zebra striping, reducing scannability
4. **Metric card typography mismatch** -- Unit Economics dashboard used `text-xl` for KPI values while all other pages used `text-2xl`
5. **Empty state icon sizing** -- Practice Intelligence used `h-10 w-10` while all other pages used `h-12 w-12`
6. **Sidebar lacked visual separation** -- No border between logo header, nav content, and user footer
7. **Scrollbar styling** -- Default browser scrollbars on overflow containers appeared bulky in data-dense tables
8. **Loading skeleton missing title placeholder** -- Dashboard skeleton showed cards without a title skeleton above

---

## Changes Implemented

### 1. Global CSS (`client/src/index.css`)

**Table zebra striping** -- Added alternating row background via `tbody tr:nth-child(even)` with theme-aware opacity (0.35 light, 0.25 dark). Applied globally to all `<Table>` components without any per-page changes needed.

**Table header contrast** -- Added `thead th` styling: `font-size: 12px`, `letter-spacing: 0.025em`, `text-transform: uppercase`, subtle muted background. Gives immediate visual hierarchy.

**Page header utility class** -- Created `.page-header` CSS class that standardizes: flex-wrap layout, responsive title sizing (xl mobile, 2xl desktop), subtitle styling. Pages now just use `className="page-header"` instead of inline flex/gap/font classes.

**Custom scrollbars** -- Added thin 6px scrollbar styling for `.overflow-x-auto` and `.overflow-auto` containers. Muted track with subtle thumb, hover state for interaction feedback.

### 2. Table Component (`client/src/components/ui/table.tsx`)

- `TableHead` height: `h-12` -> `h-10` (tighter, data-dense)
- `TableHead` weight: `font-medium` -> `font-semibold` (stronger hierarchy)

### 3. Dashboard (`client/src/pages/dashboard.tsx`)

- Header: replaced inline flex/font-size with `page-header` + `page-subtitle` classes
- "Updated at" timestamp: added `/70` opacity for visual de-emphasis
- Loading skeleton: added `max-w-7xl mx-auto` for alignment + title skeleton placeholder

### 4. Physicians Page (`client/src/pages/physicians.tsx`)

- Header: replaced inline flex/font-size with `page-header` + `page-subtitle` classes

### 5. Referrals Page (`client/src/pages/referrals.tsx`)

- Header: replaced inline flex/font-size with `page-header` + `page-subtitle` classes

### 6. Executive Dashboard (`client/src/pages/executive-dashboard.tsx`)

- Header: replaced inline flex/font-size with `page-header` + `page-subtitle` classes
- "Updated at" timestamp: aligned style with dashboard pattern

### 7. Unit Economics Dashboard (`client/src/pages/unit-economics-dashboard.tsx`)

- Header: replaced inline flex with `page-header` + `page-subtitle`
- KPI card values: `text-xl` -> `text-2xl` to match all other pages
- Empty state header: reduced mb-6 to mb-4 for consistency

### 8. Practice Intelligence (`client/src/pages/practice-intelligence.tsx`)

- Header: replaced inline heading with `page-header` + `page-subtitle` classes
- Removed redundant `bg-muted/30` on table header row (now handled globally)
- Empty state icon: `h-10 w-10` -> `h-12 w-12` to match other pages

### 9. Physician Detail (`client/src/pages/physician-detail.tsx`)

- Title: added `sm:text-2xl` responsive sizing
- Subtitle: uses `page-subtitle` class for consistency

### 10. Sidebar (`client/src/components/app-sidebar.tsx`)

- Header: added `border-b border-sidebar-border` separator
- Subtitle: `text-xs` -> `text-[11px] tracking-wide uppercase` for professional label styling
- Footer: added `border-t border-sidebar-border` separator

---

## Verification

- `npx tsc --noEmit` -- 0 new errors introduced (all existing errors are pre-existing server-side issues)
- All changes are visual-only; no component APIs, data fetching, or routing logic modified
- Dark mode compatible (all new CSS uses CSS variables)
- All `data-testid` attributes preserved

---

## Design Rationale

### Why uppercase table headers?
Healthcare CRMs display dense tabular data. Uppercase, smaller, semibold headers create clear visual separation between column labels and data cells -- standard in financial and healthcare dashboards (Epic, Athena, Salesforce Health Cloud).

### Why zebra striping?
With 50+ row tables (physician list uses pageSize=50), alternating backgrounds significantly reduce horizontal tracking errors. The subtle opacity values ensure it works in both light and dark mode without competing with hover/selection states.

### Why centralized page-header class?
6 different header patterns across 6 pages created cognitive inconsistency. A single CSS class ensures all pages share identical title/subtitle sizing, spacing, and alignment, and future pages automatically inherit the pattern.

### Why thin scrollbars?
Default browser scrollbars in data-dense healthcare dashboards visually compete with the data. A 6px thumb with muted colors reduces visual noise while maintaining scrollability feedback.

---

## Not Changed (Out of Scope)

- Color palette/branding
- Component library (shadcn) internals beyond Table
- Any data fetching, routing, or business logic
- Loading state skeleton structure (only alignment fix)
- Mobile-specific layouts (existing responsive design is adequate)
