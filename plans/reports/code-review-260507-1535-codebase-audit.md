# Code Review — Tristar 360° CRM Full Codebase Audit

**Date:** 2026-05-07 15:35 UTC
**Branch:** `feat/calendar-views-and-filters` (working off `origin/main` @ `9349330`)
**Reviewer:** automated audit
**Scope:** entire `client/src`, `server`, `shared` — 249 TS/TSX files, ~53k LOC

---

## Executive Summary

Codebase is **healthier than the file count suggests**. Security/HIPAA fundamentals are in place: CSRF middleware on `/api/*`, role-gated routes (`requireRole`), audit logging table + helpers, session timeout, no PHI in client logs/localStorage, error boundary at app root, schema-typed nullability used consistently. Drizzle SQL is parametrized — no injection risks found.

The **biggest active risk** is **silent save failures**. 45 of 132 mutations across the app have no `onError` handler. When backend returns 401/500/CSRF-stale, the user sees nothing happen and assumes the data saved. This **matches Casey's complaint verbatim** ("we go to put anything into a contact… can't even save"). Worth fixing before chasing UI polish.

The second risk is **modularity decay**: 94 files exceed the 200-line cap, including five over 800. This isn't a bug — it's a velocity tax that compounds. PR #7 just made `calendar.tsx` 1310 lines. Split is overdue.

PR #6 fixed the only actively-crashing `.replace(null)` site. Other 11 `.replace` calls scanned are all on schema `notNull()` enum columns and safe in normal flow.

---

## Critical (impact users now)

### C-1. Silent save failures — 45 mutations missing `onError`
**Severity:** Critical (matches the "won't save" complaint from May 7 meeting)
**Why:** `apiRequest` throws on `!res.ok`. Mutations without `onError` silently enter error state — no toast, no banner, no log. UI looks fine, data is gone.
**Worst offenders** (more `useMutation` than `onError`):

| File | Mutations | onError | Missing |
|---|---|---|---|
| `client/src/pages/frontdesk.tsx` | 6 | 2 | 4 |
| `client/src/pages/integrations.tsx` | 7 | 3 | 4 |
| `client/src/pages/territories.tsx` | 3 | 1 | 2 |
| `client/src/pages/tasks.tsx` | 3 | 1 | 2 |
| `client/src/pages/physicians.tsx` | 9 | 7 | 2 |
| 17 other pages | — | — | 1 each |

**Concrete repro:** `frontdesk.tsx:77` `triageMutation`, `:113` `scheduleMutation`, `:131` `waitlistMutation` — none alert the user on failure.
**Fix:** add a shared `onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" })` to every mutation. Could centralize via a `useDefaultMutation` hook to enforce.
**Effort:** 1–2 hours (mechanical), or 30 min if a custom hook is added.

### C-2. CI didn't run on PR #7 (calendar overhaul)
**Severity:** Critical (deployable code shipped without typecheck/test gate)
**Why:** PR #6 ran `Type Check` + `Tests`; PR #7 only ran Vercel. Both target `main`, both pre-merge. `.github/workflows/ci.yml` triggers on `pull_request: branches: [main, dev]`. Possible cause: workflow file isn't on `origin/main` yet, or there's a path/branch filter I missed.
**Verify:** look at GitHub Actions → confirm workflow ran on PR #7's commits.
**Fix:** if not running, fix the workflow trigger; if just slow, no action.

### C-3. Single-page calendar exceeded reasonable single-file size
**Severity:** Important (PR #7 just shipped this; covered for reference)
**Why:** `calendar.tsx` is now 1310 lines — month/week/day/list views, dialogs, helpers all inline. Future bugs will be hard to land.
**Fix:** extract `calendar-month-view.tsx`, `calendar-week-view.tsx`, `calendar-day-view.tsx`, `calendar-list-view.tsx` from `client/src/pages/calendar.tsx`. The view rendering is already cleanly switch-based, so extraction is mechanical.
**Effort:** 1 hour. Suggest doing it before the next calendar-touching PR.

---

## Important (architectural risks)

### I-1. 487 `any` types
**Severity:** Important. CLAUDE.md says "No `any`. Define interfaces in `src/types/`."
**Reality:** widely violated. Includes `app.use(globalErrorHandler as any)` at `server/app.ts:66`.
**Fix:** Hot files first — `server/middleware/errorHandler.ts`, `client/src/pages/dashboard.tsx`, anywhere touching `req.session` or DB results. Lint rule (`@typescript-eslint/no-explicit-any`) would prevent regression.

### I-2. No ESLint config
**Severity:** Important. CLAUDE.md says "Run linting before commit" / "`npm run lint`"; neither exists.
**Reality:** no `.eslintrc*`, no `eslint.config.*`, no `lint` script. Only `tsc` runs.
**Fix:** add minimal `eslint.config.js` with `@typescript-eslint`, `react-hooks`, react-query rules. Add `"lint": "eslint ."` to scripts. Wire into CI.

### I-3. Documentation drift
**Severity:** Important. CLAUDE.md claims state library is **Zustand**, but `0` Zustand imports in the codebase. Pages use `useState` (some with 19 of them — `calendar.tsx`).
**Fix:** either delete the Zustand line or consolidate the worst-offending state into a Zustand slice. Recommend deleting it; the codebase doesn't actually need a global store yet (YAGNI).

### I-4. 94 files exceed 200-line cap
**Severity:** Important.
**Top 10:** calendar (1250 pre-PR-7 / 1310 post), dashboard (1059), schema (991, OK for one schema file), integrations (978), physician-detail (849), import (844), feedback (842), storage (810), sidebar (727), routes/dashboard (693). Sidebar is shadcn — leave it. The five page-level ones are real targets.
**Fix:** opportunistic — split when adding features, don't do a big-bang refactor.

### I-5. Stale build risk for in-prod fixes
**Severity:** Important (procedural, not code).
**Why:** PR #6 fixes a crash for one specific physician (`011d1c37…`). The branch is targeting `main` but production is **Railway**, not Vercel. Vercel preview ≠ Railway prod. If PR #6 merges to main but Railway hasn't pulled, the crash persists.
**Fix:** confirm Railway is wired to auto-deploy `main`. Otherwise add a manual deploy step to the PR flow.

---

## Minor (cleanup / debt)

- **M-1.** `console.error("Unhandled error:", err)` at `server/middleware/errorHandler.ts:33` logs full error object. If error messages contain PHI, they'd hit logs. Recommend redacting message before `console.error` or using a structured logger that scrubs PHI fields.
- **M-2.** `physician-detail.tsx:304` — `physician.relationshipStage.replace("_", " ")` — schema-safe (`.notNull().default("NEW")`) but trivial to make defensive (`?.replace`) for free defense-in-depth on par with PR #6.
- **M-3.** Calendar's `useState` count: 19. Reach into `useReducer` for related state groups (dialog flow, practice combobox flow) when next touching the file.
- **M-4.** `server/__tests__/` and `tests/` co-exist. Pick one (`tests/` is more Vitest-idiomatic). Light cleanup.
- **M-5.** `dist/index.cjs` is 2.8 MB, builder warned. Consider `esbuild --splitting` or trimming server bundle.
- **M-6.** `auth-microsoft-sso.ts:189` logs `err.stack` to console on callback failure — fine in server logs, but ensure those logs aren't shipped anywhere user-readable.

---

## What's solid (do not "improve")

- Error boundary present, Suspense for lazy routes — handles render-time crashes cleanly.
- CSRF middleware on `/api/*` + `x-csrf-token` cookie pattern.
- All 36 route files use `requireRole(...)` (which implies auth + role) — false-positive on the initial "missing requireAuth" grep.
- 19 test files, including security-focused (CSRF, SSRF, authz-ownership, env validation, db pool config).
- Audit logging infrastructure (`createAuditLog`, `auditLogs` table) wired through storage layer.
- Drizzle parametrized SQL — zero injection vectors found.
- Foreign-key/index parity (54 / 54).
- Zero `console.log` in client code → no PHI leakage in browser console.
- TypeScript strict mode on (`tsconfig.json: "strict": true`).
- Schema-typed nullability used consistently for `.notNull()` enum fields.
- Recent commits show good hygiene: conventional-commit messages, no AI references, no dotfile noise.

---

## Recommended next 3 PRs

1. **`fix(mutations): add toast onError to silent-failure mutations`** — 1–2 hours, mechanical, addresses the most-reported user complaint (Casey's "won't save"). Touch the 22 files identified in C-1. Add a `useToastedMutation` helper to make regression hard.
2. **`refactor(calendar): split into per-view components`** — 1 hour. Pull each view out of `calendar.tsx` before the optional-provider task feature lands. Calendar becomes a coordinator (~250 lines), each view ~150–200.
3. **`feat(calendar): provider-optional events + community event type`** — Casey's other meeting ask. Make `physicianId` truly optional on calendar events (already nullable in schema; UI just doesn't expose it). Add a UI affordance for "Community Event / School / Senior Center" without requiring a provider.

---

## Unresolved questions

1. Did GitHub Actions actually run on PR #7? (only Vercel showed up; was it a queue delay or a workflow trigger gap?)
2. Is Railway auto-deploying `main`, or does Jordan need to manually trigger after merge? Affects whether PR #6 actually unblocks the broken physician page.
3. Are server logs (`console.error("Unhandled error:", err)`) shipped to a HIPAA-aware sink, or do they only sit on the Railway box? PHI-in-error-message risk is hypothetical only if logs leak.
4. CLAUDE.md mentions Zustand and `npm run lint`. Are those aspirational ("we want this someday") or just stale? If aspirational, this audit is also a request to commit or delete.
5. Should we adopt a lint rule that blocks new `any` types and new mutations without `onError`, or is the current honor-system OK for the team's velocity?
