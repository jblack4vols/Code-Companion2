# UI/UX Audit — Tristar 360° CRM

**Date:** 2026-05-07 16:50 UTC
**Branch:** `chore/prod-health-monitoring` (read-only audit, no code changes)
**Scope:** entire `client/src` against CLAUDE.md design rules + WCAG 2.1 AA + ui-ux-pro-max skill recommendations
**Method:** static grep + token inspection + manual review

---

## Executive Summary

Codebase mostly **follows the design rules CLAUDE.md sets out**: zero emoji icons, zero PHI in client logs, error boundary present, Suspense boundaries on lazy routes, schema-typed nullability, shadcn primitives used widely, alt-text on images. The brand token `--primary` resolves to Tristar orange `#FF8200` in light mode as documented.

The **most material issues** are brand and accessibility, in that order:

1. **Dark mode silently rebrands the app to blue.** `--primary` in `.dark` resolves to `hsl(203.77 87.6% 52.5%)` ≈ `#1FA2FF`. **21 pages** use `bg-primary`/`text-primary`/`border-primary` and will all flip blue when a user toggles to dark. CLAUDE.md states Tristar orange is THE primary color.
2. **45 icon-only buttons have no `aria-label`** — they're announced as "button" by screen readers with no context. Concentrated in physicians-table, interactions, theme-toggle, sidebar.
3. **shadcn Form is documented but not used.** CLAUDE.md says "Forms use `useForm` + `Form` from `@/components/ui/form`." Actual usage: **0 files** import it. There are 19 raw `<form>` tags instead.
4. **Currency formatting drift** in 6 spots — uses `$${val.toFixed(2)}` rather than the documented `toLocaleString({ style: 'currency', currency: 'USD' })` convention.

Volume metrics that look fine: 73% of pages are responsive (have `sm:`/`md:`/`lg:` classes), 1 `<div onClick>` (acceptable), 0 pages with positive `tabIndex`, 8 explicit `focus:` classes (low because shadcn primitives ship with focus styling baked in via Radix — this is OK).

---

## Critical (real user impact)

### C-1. Dark mode flips primary from Tristar orange to blue
**Severity:** Critical (brand)
**Files:** `client/src/index.css:114`
```css
.dark {
  --primary: 203.7736 87.6033% 52.5490%;       /* ≈ #1FA2FF (blue) */
  --primary-foreground: 0 0% 100%;
}
```
**Light mode** has `--primary: 30.59 100% 50%` ≈ `#FF8200` (correct Tristar orange).
**Affected:** 21 pages using `bg-primary` / `text-primary` / `border-primary`. Includes login, physicians-table, integrations, executive-dashboard, etc.
**Fix:** Set `.dark { --primary: 30.59 100% 50%; }` or pick an accessible darker-orange variant (e.g. `30 100% 55%`) that meets AA contrast against the dark background. Same issue applies to `--sidebar-primary` (line 21, blue in both modes — never orange).
**Effort:** 5 min. Just two HSL value changes.

### C-2. 45 icon-only buttons have no `aria-label`
**Severity:** Critical (WCAG 2.1 — 1.1.1, 4.1.2)
**Why:** `<Button size="icon"><Pencil/></Button>` — a screen reader announces "button". User has no idea what it does. Affects every favorite/edit/sync/back/delete affordance across the app.
**Worst clusters:**

| File | Icon-only buttons |
|---|---|
| `pages/interactions.tsx` | 3 |
| `pages/physicians-table.tsx` | 4 |
| `pages/provider-scorecard.tsx` | 2 |
| `pages/calendar.tsx` (after PR #7 + #9) | ~6 |
| `components/theme-toggle.tsx` | 1 |
| `components/ui/sidebar.tsx` | 1 |
| 30+ more across pages | 1-2 each |

**Fix pattern:**
```tsx
<Button size="icon" aria-label="Edit interaction" ...>
  <Pencil className="w-4 h-4" />
</Button>
```
**Effort:** 1-2 hours mechanical sweep, or 30 min with codemod.

### C-3. shadcn Form documented but never used (0 imports)
**Severity:** Critical (consistency + validation drift)
**Why:** CLAUDE.md says forms must use `useForm` + `Form` from `@/components/ui/form` with `zodResolver`. Current state: **0 imports from that path**, **19 raw `<form>` tags**. Many forms validate inline or skip client-side validation entirely; some rely solely on server Zod failure → toast. Inconsistent UX (some forms show inline field errors, others only toasts).
**Fix:** Either drop the rule from CLAUDE.md (YAGNI), or migrate the highest-traffic forms (interaction logging, physician edit, calendar event create) and grandfather the rest. Recommend the second.
**Effort:** 30-60 min per form migration; 3-4 priority forms = 2-3 hours total.

---

## Important (consistency / brand drift)

### I-1. Currency formatting drift (6 occurrences)
**Severity:** Important
**Files:**
- `pages/rpv-analytics-chart.tsx:39, 41`
- `pages/rpv-analytics.tsx:86-87`
- `pages/unit-economics-alerts.tsx:54`
- `pages/unit-economics-location-detail.tsx:328`
- `pages/rpv-analytics-payer-table.tsx:51`

CLAUDE.md spec: `(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })`. Actual: `$${val.toFixed(2)}`. Visible difference: no thousands separator (`$1234.56` vs `$1,234.56`). On larger figures it looks unfinished.
**Fix:** create a `formatCurrency(n)` helper in `lib/utils.ts` and replace the six call sites.
**Effort:** 15 min.

### I-2. Sidebar primary is blue in both light and dark mode
**Severity:** Important (brand)
**File:** `client/src/index.css:21, 22`
```css
--sidebar-primary: 203.8863 88.2845% 53.1373%;   /* always blue */
```
**Why:** the active nav-item indicator is blue, not Tristar orange. Inconsistent with the rest of the app (which is orange in light mode).
**Fix:** mirror `--primary`. Either remove `--sidebar-primary` overrides and let it inherit, or set both to the same orange.
**Effort:** 2 min.

### I-3. 29 raw `bg-blue-*` / `bg-red-*` / `bg-green-*` / `bg-yellow-*` classes
**Severity:** Important (theme drift)
**Why:** mixing literal Tailwind colors with the theme's `chart-1..5` / `destructive` / `primary` tokens means dark mode and brand changes don't propagate. Especially fragile if you ever rebrand or add a third theme.
**Where:** spread across pages — referrals, dashboard, frontdesk, executive-dashboard, etc.
**Fix:** map to semantic tokens. Convention used elsewhere in the codebase:
- success/at-target → `bg-chart-4/15 text-chart-4`
- danger/below-target → `bg-chart-5/15 text-chart-5` or `text-destructive`
- warning → `bg-chart-3/15 text-chart-3`

**Effort:** 1 hour mechanical sweep.

### I-4. Loader2 spinners without Skeleton fallback (10+ pages)
**Severity:** Important (CLAUDE.md + UX)
**Why:** CLAUDE.md says "Loading states: Use shadcn Skeleton — never a spinner alone." Loader2 inside a button (during mutation) is fine. Loader2 as the page-level loading state is the violation.
**Files to triage** (need to check whether Loader2 is in-button or page-level):
`unit-economics-data-import.tsx`, `hit-list.tsx`, `unlinked-referrals.tsx`, `referrals-edit-form.tsx`, `sharepoint-sync.tsx`, `login.tsx`, `import.tsx`, `quick-log.tsx`, `reset-password.tsx`, `revenue-claims.tsx`.
**Fix:** swap page-level Loader2 for Skeleton mimicking the layout. Keep Loader2 only inside Buttons during mutations.
**Effort:** 1 hour.

---

## Minor

- **M-1.** Only 38/86 (44%) pages have any `dark:` prefix. Combined with C-1, dark mode is a partial product. Recommend either committing to dark or hiding the toggle until coverage is broader.
- **M-2.** 12 raw `<button>` elements (CLAUDE.md says "Use shadcn `Button`"). Mostly inside dialogs. Low risk, fix opportunistically.
- **M-3.** 8 explicit `focus:` classes total. Low because shadcn/Radix bake focus rings in. But anywhere there's a custom interactive element (the 1 div onClick, custom dropdowns, etc.), confirm a focus ring is present.
- **M-4.** Percentage formatting: only 2 places use the documented `(ratio * 100).toFixed(1) + '%'` convention. Most percentages are formatted ad-hoc. Like currency, worth a small `formatPct(ratio)` helper.
- **M-5.** Outline-none is used in shadcn primitives (command, popover, hover-card, chart). This is OK — Radix supplies focus-visible styling. No change needed.
- **M-6.** `--accent-foreground` in light mode is `30deg 100% 91.76%` (very pale orange) — this is text color on accent backgrounds. Combined with `--accent` at `211 51% 92.7%` (very pale blue), accent backgrounds may have poor contrast. Worth a contrast-checker pass if accent is used for actual text.

---

## What's good (do not "improve")

- ✅ Zero emoji icons. Lucide everywhere.
- ✅ Zero `console.log` in client (no PHI leakage).
- ✅ Error boundary at app root (`App.tsx:14`) + Suspense for lazy routes.
- ✅ Schema-typed nullability used consistently — almost all `.replace(_)` calls are on `notNull()` enum columns.
- ✅ Light mode `--primary` correctly maps to Tristar orange `#FF8200`.
- ✅ shadcn primitives used widely (Card, Button, Badge, Skeleton, Dialog, Table, Select, Popover, Command).
- ✅ 73% of pages have responsive breakpoints.
- ✅ All `<img>` tags have `alt` attributes.
- ✅ No positive `tabIndex` values (no keyboard-order anti-patterns).
- ✅ Audit logging infrastructure wired (HIPAA requirement).
- ✅ CSRF + role-gating + rate limiting + session timeout all present.

---

## Recommended next 3 PRs (in priority order)

1. **`fix(theme): keep primary token Tristar orange in dark mode + sidebar`** — 2 lines of CSS, fixes the brand-flip on 21 pages instantly. Highest visual impact for least effort.
2. **`fix(a11y): aria-label on all icon-only buttons`** — 1-2 hours mechanical. Could ship as one big sweep PR or as smaller per-page PRs. Either is fine.
3. **`refactor(formatting): introduce formatCurrency / formatPercent helpers + sweep call sites`** — 30 min. Fixes I-1 + M-4 in one go, and prevents future drift via the helper-as-funnel pattern.

The rest (I-3 raw colors, I-4 Loader2, M-1 dark mode coverage) are debt that can be paid down opportunistically when touching those files.

---

## Unresolved questions

1. Is **dark mode** an actually-supported product mode, or is it a half-built feature? Coverage is 44% of pages; if you're not committed, hide the toggle. If you are, the C-1 brand fix is mandatory and the M-1 coverage gap is real.
2. Does CLAUDE.md's **"never use HTML `<form>`"** rule still hold, given that 0 files use shadcn Form? Either the rule should be enforced (migrate forms) or relaxed (delete the rule).
3. Should we add an **ESLint rule** for `@typescript-eslint/jsx-a11y/control-has-associated-label` so missing-aria-label icon-buttons fail CI? Would prevent C-2 regression. (No ESLint config exists — this dovetails with audit finding I-2 from `code-review-260507-1535-codebase-audit.md`.)
