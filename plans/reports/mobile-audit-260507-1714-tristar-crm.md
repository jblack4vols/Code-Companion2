# Mobile-Friendliness Audit — Tristar 360° CRM (web)

**Date:** 2026-05-07 17:14 UTC
**Branch:** `fix/a11y-icon-button-labels` (read-only audit)
**Scope:** entire `client/src` against mobile-first principles + skill rules + the actual field-rep usage signal from the May 7 meeting
**Method:** static grep + viewport inspection + targeted spot-checks

---

## Why this matters

Field reps (Casey, Jamie, Christina) **already use this CRM on phones in the field**. From the May 7 transcript:
- Jamie: "definitely was not, in my opinion, like mobile screen friendly. Yeah, user friendly."
- Jamie's workaround: uses Excel during the day, re-enters into the CRM at night.
- Casey: logs visits while driving on the interstate (her words, not mine — that's a read-only use case).

This isn't speculative — fixing mobile UX directly increases CRM adoption.

---

## Critical (real impact, simple fix)

### M-1. `maximum-scale=1` in viewport blocks pinch-zoom
**Severity:** Critical (WCAG 2.1 — 1.4.4 violation)
**File:** `client/index.html:5`
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
```
`maximum-scale=1` prevents users from pinch-zooming to read tiny text. Vision-impaired users and anyone trying to read a dense table on a 5.5" screen are blocked.
**Fix:** drop `, maximum-scale=1`.
**Effort:** 5 seconds.

### M-2. Touch targets way below 44×44px minimum
**Severity:** Critical (Apple HIG 44pt, Material Design 48dp)
**Examples:**

| File | Line | Element | Size |
|---|---|---|---|
| `physicians-table.tsx` | 106 | Favorite ★ button | `h-7 w-7` = 28×28 |
| `referrals-edit-form.tsx` | 77 | Clear-X button | `h-6 w-6` = 24×24 |
| `provider-office-linker.tsx` | 373 | Remove-from-queue | `h-6 w-6` = 24×24 |
| `dashboard.tsx` | 353, 466 | Tile preset / reset buttons | `h-7` = 28 |
| `provider-offices.tsx` | 268 | Clear-recent button | `h-6` = 24 |
| `practice-intelligence.tsx` | 437 | Scorecard link | `h-7` = 28 |

**Field-rep impact:** Casey/Christina trying to favorite a physician or clear a search on a phone in an office hallway will mis-tap or miss entirely.
**Fix:** bump to at least `h-9 w-9` (36px) at minimum, ideally `h-10 w-10` (40px) or unset to default size. For dense tables, give the button extra padding via touch-target wrapper instead of sizing the icon button itself.
**Effort:** 30-45 min for the 7 worst sites.

### M-3. 151 occurrences of `text-[8px]` / `text-[9px]` / `text-[10px]`
**Severity:** Critical (WCAG 1.4.4 + readability)
**Why:** sub-10px text on a 320-375px screen is unreadable without zoom — and zoom is currently blocked (M-1). Apple HIG floor is 11pt (~14.6px); Material Design Body Small is 12sp.
**Where used:** badges, table cells, labels — across many files. They look fine on a 1440px desktop monitor and crush on mobile.
**Fix:** replace `text-[10px]` → `text-xs` (12px) globally. For badges where space is tight, accept slightly larger Badge component instead of shrinking text further.
**Effort:** 1 hour. Could be a sed/replace_all sweep.

---

## Important (UX friction)

### I-1. Wide tables with `min-w-[Npx]` columns force horizontal scroll
**Severity:** Important
**Examples:**
- `physicians-table.tsx:89` — `min-w-[180px]` on Provider column
- `physicians-table.tsx:90` — `min-w-[100px]` on NPI
- `referral-intelligence-table.tsx:61` — `min-w-[160px]` on Provider
- `physicians-filters.tsx:32` — `min-w-[200px]` on search

**Why:** on a 360px viewport these columns plus the rest of the table push past viewport width, forcing the user to scroll horizontally inside the table — and once they're scrolling horizontally, the page also scrolls horizontally because of the row count.

**The good news:** physicians-table already has a partial mobile layout starting at line 156 (`{canCreate && <Button ... mobile-${p.id}>...}`). Pattern of swapping table → card list on mobile exists; just needs to be applied consistently.

**Fix:** for each wide table, add a mobile-only card list (`<div className="md:hidden">...</div>`) that mirrors the data without column constraints. Hide the desktop table on mobile (`<div className="hidden md:block">...</div>`).
**Effort:** 1.5 hours per table; 3-4 priority tables = 4-6 hours.

### I-2. Calendar event cards in day/list view are usable but tight
**Severity:** Important
**Why:** the calendar (just shipped in PR #7) uses `w-10 h-10` (40px) icon containers — under the 44px minimum but close. The pencil edit icon next to event cards is `size="icon"` with no override, so it inherits whatever the default is.
**Fix:** in calendar.tsx, bump the event icon containers to `w-11 h-11` minimum, and make the pencil edit button `size="icon"` use a 44×44 wrapper with proper padding.
**Effort:** 15 min.

### I-3. 23 sub-page components have zero responsive classes
**Severity:** Minor (but worth noting)
**Caveat:** most are component files imported into parent pages that ARE responsive. So the responsive context comes from the parent. The truly concerning ones are:
- `login.tsx` — top-level page, no responsive classes. Field reps logging in on mobile may see a desktop-shaped form.
- `reset-password.tsx` — same.
- `referrals-add-form.tsx` — embedded in a Dialog so it's on mobile a lot.
**Fix:** spot-check `login.tsx` and `reset-password.tsx` first.

---

## What's solid (do not "improve")

- ✅ **Sidebar already has mobile collapse** via shadcn's `useIsMobile` + Sheet component. Tapping the trigger opens an overlay sidebar, not a desktop static one. Works correctly.
- ✅ **Input types are mostly correct** — 36 instances of proper `type="tel"`, `type="email"`, `type="date"`, `type="datetime-local"`. Field reps get the right keyboard.
- ✅ **Phone field at `physicians-add-form.tsx:39` is the only ungated phone field I found**, and it's not type="tel" — but search-by-phone is also uncommon, and the existing UX is paste-friendly. Low priority.
- ✅ **Tap feedback exists** — 31 uses of `hover-elevate` / `active-elevate-2` (a custom Tailwind utility this codebase ships). Mobile users see a tap-down state. Good.
- ✅ **64 of 87 page files have responsive breakpoints** (`sm:`, `md:`, `lg:`). The list of "no responsive" files is mostly sub-components, not full-page violations.
- ✅ **Calendar mobile responsiveness** in PR #7 explicitly stacks week view to single column on mobile (`grid-cols-1 sm:grid-cols-7`). Day/list views are mobile-first by design.
- ✅ **Hover-only interactions are minimal** — only 7 occurrences of `group-hover:` patterns. Most interaction is on click/tap.

---

## Recommended next 3 PRs (in priority order)

1. **`fix(viewport): allow pinch-zoom on mobile`** — 1-line change in `client/index.html`. Massive a11y win for the field reps. M-1 above.
2. **`fix(a11y): bump tiny touch targets to 44×44 minimum`** — 30-45 min sweep of the 7 worst sites listed in M-2. Direct impact on Casey/Christina's ability to tap small buttons in an office hallway.
3. **`refactor(typography): replace text-[8/9/10px] with text-xs`** — 1 hour mechanical sweep. Restores readability at mobile sizes. M-3.

These three together = ~2-3 hours, addresses the actual "not mobile-friendly" complaint Jamie raised, no architectural risk.

If you want a fourth: **mobile-first card layout for the physicians table**. That's the page Casey and Jamie hit hardest in the field. ~1.5 hours.

---

## Things deliberately not in scope

- **Native app** (React Native / Flutter / Swift). The web is hitting 80% of the mobile use case once the above fixes land. Native is a 2-month engagement, not a today decision.
- **PWA / installable web app**. Reasonable add-on (~1 day to wire up `manifest.json` + service worker for offline reads), but separate concern.
- **Offline-first** (write queue + sync). Same — separate concern, weeks of work, requires backend changes.

---

## Unresolved questions

1. Do you want pinch-zoom enabled (M-1)? Some apps deliberately disable to prevent accidental zoom on input. Field reps benefit more from being able to read.
2. Are the field reps' phones predominantly iOS or Android? Affects which platform's gesture conventions to mirror in card layouts.
3. Should we add a `manifest.json` so reps can "install" the CRM as a home-screen icon? ~30 min to wire up; gives a more app-like feel without going native.
