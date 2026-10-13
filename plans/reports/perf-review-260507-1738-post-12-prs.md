# Perf Review — Post-12-PRs (May 7, 2026)

Scope: today's deltas only. Does not re-litigate dashboard.tsx/schema.ts size flagged in code-review-260507-1535-codebase-audit.md.

Surfaces reviewed:
1. Backend SQL: `GET /api/referrals/provider-trends` (server/routes/referrals.ts:343-431)
2. Frontend: client/src/pages/calendar.tsx (1274 LOC, 19 useState, 7 useQueries, 1 useMemo, 1 useEffect)
3. PWA precache (vite.config.ts, ~2055 KiB precache)
4. Mobile FAB on physician-detail.tsx (PR #18)

---

## Critical
None. No P95-affecting bug, no data-loss risk, no runaway query.

---

## Important

### I-1 [Important] calendar.tsx: every keystroke in office combobox re-renders the calendar grid
**Location:** client/src/pages/calendar.tsx:88, 1057-1066
**Impact:** Medium. Throughput drop on slow Android devices when creating/editing an event.

`practiceSearchInput` and `practiceComboOpen` are top-level Calendar component state. Each keystroke triggers a full Calendar re-render. While the office combobox lives inside the create/edit Dialog (lines 907-1234), the Dialog and the calendar grid (`calendarDays.map`, lines 547-594) share the same component, so the grid re-runs `getEventsForDay` for every visible day on every keystroke. With month view × ~35 cells × `events.filter(e => isSameDay(...))` × ~50-200 events = up to 7000 isSameDay calls per keystroke. Acceptable on desktop, sluggish on a Galaxy A-class field-rep phone.

**Fix (cheap):** Lift the combobox into its own subcomponent (PracticeCombobox) that owns `practiceSearchInput`/`practiceComboOpen` state. Pass `selectedPracticeName`, `onChange`, and `practiceNames` as props. The calendar grid no longer re-renders on each keystroke. ~30 LOC extraction.

**Fix (also good):** Wrap `typeFilteredEvents`, `sortedEvents`, and `getEventsForDay` in `useMemo` keyed on `[events, eventTypeFilter]`. This alone neutralizes the keystroke cost even without component splitting.

### I-2 [Important] sortedEvents + typeFilteredEvents recompute on every render
**Location:** client/src/pages/calendar.tsx:333-342
**Impact:** Compounds I-1. Independent of the combobox issue: any state change (toggling a user filter pill, a mutation onSuccess, a hover that flips a tooltip) re-runs both `events.filter(...)` and `events.slice().sort(...)`. With ~200 events that's ~400 ops/render.

**Fix:**
```ts
const typeFilteredEvents = useMemo(
  () => eventTypeFilter === "all" ? events : events?.filter(e => e.eventType === eventTypeFilter),
  [events, eventTypeFilter]
);
const sortedEvents = useMemo(
  () => typeFilteredEvents?.slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()) ?? [],
  [typeFilteredEvents]
);
```

### I-3 [Important] /api/referrals/provider-trends: HAVING clause forces full per-physician scan over all-time referrals
**Location:** server/routes/referrals.ts:367-394
**Impact:** Today, low (50k referrals / 1000 physicians). Becomes meaningful at 200k+ referrals.

The LEFT JOIN brings in EVERY non-deleted referral for each physician (filtered only by location). The two `COUNT(*) FILTER` aggregates and the HAVING then narrow to the 2-month window. So the planner reads all-time referrals per physician even though only the prior+current month data matters.

**Better:** Push the date window into the JOIN ON to bound work:
```sql
LEFT JOIN referrals r ON r.physician_id = p.id
  AND r.deleted_at IS NULL
  AND r.referral_date >= ${priorStart}::date
  AND r.referral_date < (${currentStart}::date + INTERVAL '1 month')
  ${locFilter}
```
Then the HAVING simplifies to `HAVING COUNT(*) > 0`.

With 50k total referrals and ~5,600/month (per CLAUDE.md), this trims the join from full-table to ~11k rows — roughly 5x less work. Works with the existing `referral_physician_idx` and `referral_date_idx`. Long-term, a composite `(physician_id, referral_date) WHERE deleted_at IS NULL` partial index would be ideal but is not warranted yet.

**Also:** No `LIMIT` on the SELECT (line 408-409). With ~1000 physicians having referrals, the response is 1000 rows × ~10 columns. Frontend table caps at `max-h-[65vh]` overflow-auto so it'll render fine, but consider `LIMIT 250` for response payload. Not blocking.

### I-4 [Important] PWA precache includes recharts vendor chunk (382 KiB) on first install for users who never view a chart
**Location:** vite.config.ts:32
**Impact:** First-install/update cost. ~5 sec on 4G, ~30 sec on 3G/spotty rural cell.

`globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"]` precaches every chunk in `dist/public/`. The `generateCategoricalChart-*.js` (382 KiB) and `index-*.js` (418 KiB) bundles together = ~800 KiB / 2055 KiB total precache, ~39%. Recharts is only used on dashboard, executive-dashboard, location-dashboard, rpv-analytics-chart, revenue-billing-lag, revenue-denials, unit-economics-location-detail, user-activity-reports — chart-heavy pages a field rep rarely opens.

**Fix:** Add `globIgnores` to exclude the recharts vendor chunk from precache. It'll still be lazy-fetched on first chart-page visit (already lazy via React.lazy), and StaleWhileRevalidate via runtimeCaching for `/assets/` would re-introduce caching after the first hit.

```ts
workbox: {
  globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
  globIgnores: ["**/generateCategoricalChart-*.js", "**/recharts-*.js"],
  runtimeCaching: [
    { urlPattern: /\/assets\/.*\.(js|css)$/, handler: "StaleWhileRevalidate", options: { cacheName: "spa-assets" } },
    // ... existing entries
  ],
}
```
Trims first-install to ~1.7 MB. Tradeoff: first chart view is online-required. Acceptable for a CRM where field reps view charts maybe weekly.

---

## Minor

### M-1 [Minor] Calendar events query refetches on day/week/month toggle even when window overlaps
**Location:** client/src/pages/calendar.tsx:159
**Impact:** ~1 wasted roundtrip per view toggle. Server query is cheap.

Switching week→day for a date inside the current week refetches because `startDate`/`endDate` change. You could fetch at month granularity always and slice client-side, but that doubles the payload for day-view users and complicates cache invalidation. Not worth it — leave as-is.

### M-2 [Minor] Calendar events query: no staleTime
**Location:** client/src/pages/calendar.tsx:158-165
**Impact:** Re-fetches on every component remount. Today the page is lazy-loaded so impact is at navigation boundaries.

Add `staleTime: 30_000`. The mutations already invalidate on success (lines 210, 226, 241) so freshness is preserved.

### M-3 [Minor] Provider-trends formatting consistency
**Location:** client/src/pages/referral-trends.tsx:216, 220, 291-292
**Impact:** Cosmetic — Prior/Current counts render as raw integers without `toLocaleString()`. Caps at ~50/month so no thousands separator needed today.

Strictly per `./CLAUDE.md` §10 the rule is "Currency formatting: always toLocaleString". Counts aren't currency. No drift introduced. Skip.

### M-4 [Minor] Mobile FAB: no perf concern
**Location:** client/src/pages/physician-detail.tsx:856-866
**Impact:** None. Top-level conditional render on `physician`. No expensive subtree, no listeners, no re-render triggers. Good.

---

## What's solid
- **Indexes for provider-trends are present:** `referral_physician_idx`, `referral_date_idx`, `referral_location_idx` (shared/schema.ts:191-193). Planner has what it needs. Issue I-3 is about query shape, not missing indexes.
- **Location scope is bounded:** 8 clinics max, `ANY(${locationScope})` is fine. No need to convert to UNNEST/subquery.
- **PWA service worker correctly excludes /api/**: `navigateFallbackDenylist: [/^\/api\//]` + `runtimeCaching` with `NetworkOnly` for `/api/*`. No accidental API caching.
- **Server bundle (dist/index.cjs, 2.8 MB) is NOT precached:** `outDir: dist/public/` scopes globPatterns to the SPA output. The server bundle lives at `dist/index.cjs`, outside that root. Verified safe.
- **Pages are aggressively lazy-loaded:** App.tsx uses React.lazy for ~30 routes. Initial JS load is small even before code-splitting recharts.
- **No new toFixed/toLocaleString drift in TODAY'S PRs:** calendar.tsx and referral-trends.tsx (the two new feature pages) use neither. The audit baseline of 6 sites is unchanged by today's work. (The `+` lines from `git diff` were dominated by unrelated/older code in larger merged branches, not the trends/calendar features themselves.)
- **Calendar mutations correctly invalidate by queryKey, not template strings.** Standard react-query v5 pattern.
- **rangeStart/rangeEnd is already useMemo'd** with correct deps (line 139-146). Not the source of the keystroke perf issue.

---

## Unresolved questions
1. Is the `provider-trends` endpoint hot? If invoked from a dashboard widget polled every 60s, I-3 deserves immediate fix. If only opened manually from the report page, file as backlog.
2. Are field reps actually on 3G in rural East Tennessee (Bean Station, Rogersville, New Tazewell)? If yes, I-4 matters. If everyone has 4G/5G, I-4 is hygiene only.
3. Workbox doesn't expose precached file size in the build log unless `vite-plugin-pwa --debug`; the user-supplied 2055.83 KiB figure could not be verified from this session (dist/ is ckignored). Confirm by running `npm run build` and reading the workbox manifest in dist/public/sw.js.

---

Severity tally: 0 Critical, 4 Important, 4 Minor. Net: codebase is healthy. Top fix is I-1+I-2 together — one extraction + two useMemos buys back ~75% of the keystroke regression, ~10 minutes of work.
