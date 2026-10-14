# Improvement Backlog

Ranked by ROI for an 8-location physician referral CRM. Evidence from codebase only.

## Priority Legend
- **P0** — data integrity / security risk, high ROI
- **P1** — significant operational improvement
- **P2** — quality-of-life, maintainability

---

| # | Priority | Improvement | Impact | Effort | Evidence | Status |
|---|---|---|---|---|---|---|
| 1 | P0 | ~~**Enforce location scoping** — wire `user_location_access` into storage queries so FRONT_DESK/MARKETER only see their locations' referrals, physicians, interactions~~ | Data isolation across 8 clinics; prevents cross-location data leakage | M | `user_location_access` table exists but no read path; all queries accept optional `locationId` from client | **DONE** — `locationIds` array support added to `PhysicianFilters`, `InteractionFilters`; `getPhysiciansPaginated` uses referrals subquery; `getInteractionsPaginated` uses `inArray`; routes call `getUserLocationScope()` |
| 2 | P0 | ~~**Add ownership checks on mutations** — interactions, referrals, calendar events, tasks should verify the user owns the record or has DIRECTOR+ role~~ | Prevents reps from editing each other's data | S | `PATCH /api/interactions/:id`, `referrals/:id`, `calendar-events/:id`, `tasks/:id` lack userId guards | **DONE** |
| 3 | P0 | ~~**Guard `PATCH /api/tasks/:id`** — require at minimum the assigned user or DIRECTOR+ role~~ | Any FRONT_DESK/ANALYST can reassign or close any task today | XS | `tasks.ts:50` uses only `requireAuth` | **DONE** |
| 4 | P1 | ~~**Role-guard `GET /api/users`** — restrict full user list to DIRECTOR+; return minimal (id, name) for others~~ | User emails/roles exposed to all authenticated users unnecessarily | XS | `users.ts:9` | **DONE** |
| 5 | P1 | ~~**Role-guard financial data** — restrict `GET /api/collections` and executive dashboard to DIRECTOR+/ANALYST~~ | Revenue data visible to FRONT_DESK today | XS | `territories.ts:47`, `dashboard.ts` | **DONE** |
| 6 | P1 | **At-risk referral source detection** — query physicians with referrals down >20% over 2 months + no touchpoint in 30 days + overdue follow-up | Proactive relationship recovery; prevents silent churn of key referral sources | M | ETL computes `physician_monthly_summary` and `relationship_stage` but no at-risk alerting dashboard exists | Dashboard exists (at-risk referral sources); full alerting/push not yet done |
| 7 | P1 | ~~**Referral-to-arrival conversion tracking per location** — surface `arrivedVisits / scheduledVisits` ratio on location dashboard card~~ | 8 locations need to compare intake efficiency; data exists but no per-location breakdown in UI | S | `referrals.scheduledVisits`, `arrivedVisits` columns exist; `location_monthly_summary` has `referralsCount` but not arrival rate | **DONE** — `GET /api/dashboard/location-conversion` endpoint; `LocationConversionCard` on main dashboard with table, progress bars, color-coded arrival rate badges |
| 8 | P1 | ~~**Move hardcoded SMTP config to env vars** — sender email, SMTP host, port~~ | Deploying outside Replit or changing email sender requires code change | XS | `outlook.ts:5` hardcodes `jblack@tristarpt.com`, `smtp.office365.com` | **DONE** — `SMTP_USER`, `SMTP_HOST`, `SMTP_PORT` env vars |
| 9 | P1 | ~~**Deduplicate auth middleware** — consolidate `server/middleware/auth.ts` and `server/routes/shared.ts` into one source~~ | Two identical implementations can drift independently | XS | Both files export `requireAuth`, `requireRole` with same logic | **DONE** — `middleware/auth.ts` re-exports from `shared.ts` |
| 10 | P1 | ~~**Add FK constraint for `physicians.territoryId`**~~ | Orphaned territory references possible today; data integrity risk | XS | `physicians` table uses bare `varchar` with no `.references()` | **DONE** |
| 11 | P2 | ~~**Implement `interaction_templates` storage layer** — add CRUD methods to `IStorage`/`DatabaseStorage`~~ | Schema and types defined, route file exists, but storage methods missing — templates feature is half-wired | S | `interaction_templates` table in schema; no methods in `storage.ts` IStorage interface | **DONE** |
| 12 | P2 | ~~**Wire `physician_stage_history` into storage** — add query methods, expose timeline on physician detail page~~ | Stage transitions tracked by ETL but no storage methods or UI to view history | S | Table populated by `etl.ts` but not in IStorage; route exists in `features.ts` using direct db queries | **DONE** |
| 13 | P2 | ~~**Remove unused dependencies** — `passport`, `passport-local`, `csrf-csrf`, `memorystore`~~ | Reduces bundle size, removes confusion | XS | Installed in `package.json` but not imported in any server code | **DONE** |
| 14 | P2 | ~~**Add location-scoped API key filtering** — public API keys should restrict data to specific locations~~ | Current API keys only check scope strings (`physicians:read`) but return all data | S | `publicApi.ts` validates scope but queries are unscoped | **DONE** — `locationIds` field on `api_keys` table |
| 15 | P2 | ~~**Strengthen seed password handling** — fail startup if `SEED_OWNER_PASSWORD` env var is unset in production~~ | Default `change_me_owner` password persists if env vars not configured | XS | `seed.ts` falls back to weak defaults | **DONE** — warns to console in production |

---

## Effort Key
- **XS** — < 1 hour, single file change
- **S** — 1–4 hours, 2–3 files
- **M** — 4–12 hours, multiple files + tests

---

## Roadmap Features — all shipped

All six roadmap analytics features are built and merged to `main`:

| Feature | Route | Status |
|---|---|---|
| Referral Intelligence Dashboard | `/referral-intelligence` | DONE |
| RPV Analytics by Location | `/rpv-analytics` | DONE |
| Provider Productivity View | `/unit-economics/providers` | DONE |
| Patient Lifecycle Funnel | `/lifecycle` | DONE |
| BCBS Audit Status Panel | `/revenue/bcbs-audit` | DONE — payer-scoped claim-lifecycle + exposure panel (`storage-bcbs-audit.ts`, `GET /api/revenue/bcbs-audit`), PR #64 |
| Cash Flow Projection | `/cash-flow` | DONE |

## Remaining P1

- **#6 — At-risk referral source alerting.** ~~Detection→notification wiring.~~ **DONE** — detection
  (`getAtRiskReferralSources`) and the in-app dashboard card (`AtRiskReferralSourcesCard`) already
  existed; added the proactive **email push**: weekday `sendAtRiskReferralDigests()` emails OWNER/DIRECTOR
  a digest of at-risk sources (down 20%+ with no 30-day contact or overdue follow-up) via
  `sendAtRiskReferralDigestEmail`, scheduled alongside the overdue-task digest.

---

## Round 2 — fresh codebase pass (2026-10-13)

Original P0–P2 list above is cleared. New findings from a three-dimension audit (security/HIPAA,
performance/data-layer, maintainability/tests). Evidence from codebase only; ranked by ROI.

| # | Pri | Finding | Impact | Effort | Evidence |
|---|---|---|---|---|---|
| R2-1 | P0 | **Add unique index/constraint on `claims.claim_number`** | `upsertClaim` uses `ON CONFLICT (claim_number)` but no unique index exists — Postgres needs one, so claims import may be throwing; every `WHERE claim_number =` is a seq scan | XS | `shared/schema.ts:744-777` (no unique), `storage-revenue-recovery.ts:82`. **Verify against live DB first.** |
| R2-2 | P0 | **Location-scope `/api/revenue/*` claims/denials/BCBS reads** | ANALYST is location-scoped but these endpoints never call `getUserLocationScope()`; a scoped analyst sees all 8 locations' claims (incl. `patientAccountNumber`, financials) & BCBS exposure | M | `routes/revenue-recovery.ts:160,389,472,552,…`; `storage-revenue-recovery.ts:43-58`; `storage-bcbs-audit.ts:50` (no loc filter — from this session's panel) |
| R2-3 | P0 | **Location-scope front-desk patient-request PHI** | `GET /api/frontdesk/requests` + `/stats` return every location's intake PHI (`patientName`, `phone`, `symptoms`) to any FRONT_DESK user; minimum-necessary violation | M | `routes/frontdesk.ts:56-76,228`; `shared/schema.ts:849-865` |
| R2-4 | P1 | ~~**Zod-validate revenue/appeal write bodies**~~ | `POST /api/revenue/claims`, `/claims/bulk`, `/rates`, `/appeal-templates` pass `req.body` straight to storage; schemas exist but unused → malformed fields reach DB, 500s | S | `routes/revenue-recovery.ts:196,208,451`; `revenue-recovery-appeals.ts:65`; schemas `shared/schema.ts:893-907` | **DONE** — `insertClaimSchema`, `insertPayerRateSchema`, `insertAppealTemplateSchema` wired into all 4 write endpoints with `safeParse` + 400 response |
| R2-5 | P1 | **Fix `flagUnderpaidClaims` N+1 run inside the import request** | Per-claim re-fetch ×2 + per-CPT rate SELECT, all sync in the HTTP path → claims-import latency grows ~quadratically, timeouts at scale | M | `storage-revenue-recovery.ts:312-344,291-310`; invoked `routes/revenue-recovery.ts:322` |
| R2-6 | P1 | **Delete dead root `src/` dir (24 files) + drop `@supabase/supabase-js`** | Abandoned Next.js port never built/typechecked (tsconfig excludes it); live versions live in `client/src/pages`; `src/lib/supabase.ts` is the dep's only importer | S | `/src/**`; `tsconfig.json` include; `vite.config.ts` root |
| R2-7 | P1 | **Add pure-logic tests for ETL summaries & cash-flow** | Two financially-significant modules with testable pure helpers have zero tests | M | `etl-summary-generation.ts` (225 ln), `routes/cash-flow.ts` (295 ln) |
| R2-8 | P2 | **Drop per-row probe loops in bulk upserts** | `bulkUpsertClaims`/`bulkUpsertPayerRates`/unit-econ imports do a per-row `SELECT` before each upsert (ON CONFLICT already covers it) → O(2N) round-trips | S | `storage-revenue-recovery.ts:116-122,246-253`; `storage-unit-economics.ts:127-133,180-186` |
| R2-9 | P2 | ~~**Index `referrals.updatedAt` + `collections.updatedAt`**~~ | Incremental nightly ETL filters by `updated_at` with no index → seq scans that worsen with data growth | XS | `etl.ts:43-44`; `shared/schema.ts:193-197,299-300` | **DONE** — `referral_updated_at_idx` + `collection_updated_at_idx` added |
| R2-10 | P2 | **Paginate/cap `GET /api/revenue/underpaid`** | Returns all underpaid claims, no limit (unlike `getClaims`) → unbounded dashboard payload | S | `storage-revenue-recovery.ts:141-156` |
| R2-11 | P2 | **Extract shared CSV/XLSX parse helpers; kill test drift** | `parseNum`/date parser duplicated & drifted across `revenue-recovery.ts` & `unit-economics.ts`; the import-parsing test reimplements a 3rd copy, so it validates logic the routes don't run | S | `routes/revenue-recovery.ts:55,62`; `routes/unit-economics.ts:88,95`; `__tests__/unit-economics-import-parsing.test.ts:14,26` |
| R2-12 | P2 | **Standardize error handling via `next(err)` + global handler** | 0 routes use the documented global handler; ~9 handlers return raw `err.message` (leaks internals, diverges from CLAUDE.md) | S | `routes/revenue-recovery.ts:175,187,198,…` |
| R2-13 | P2 | **Split files well over the 200-line convention** | Maintainability; clean endpoint seams | M | `sharepoint.ts` 818, `storage.ts` 810, `routes/dashboard.ts` 693, `routes/import.ts` 647, `routes/revenue-recovery.ts` 626 |
| R2-14 | P2 | **Upgrade/replace `xlsx` 0.18.5** | Known npm advisories (prototype-pollution / ReDoS) in that pinned version | S | `package.json`; used in `server/import-real-financials.ts` |
| R2-15 | P2 | **Remove likely-unused `ws` dependency** (verify first) | No import anywhere; app uses `pg` not neon-serverless | XS | `package.json:96`; only an esbuild `external` |

**Recommended first three:** R2-1 (XS, possible broken import), then R2-2 + R2-3 (the two Critical HIPAA
location-scoping gaps). R2-2 includes the BCBS panel shipped this session.

**Shipped:** R2-1 (unique index, PR #70) · **R2-2 DONE** — `getUserLocationScope()` wired into every
`/api/revenue/*` claims/denials/underpayments/BCBS read + single-claim detail; storage gained a
`locationIds` scope filter. **R2-3 DONE** — `/api/frontdesk/requests` + `/stats` scoped by
`locationPreference` (scoped staff see their locations plus unrouted intakes; OWNER/DIRECTOR see all).
**R2-4 DONE** — Zod validation (`insertClaimSchema`/`insertPayerRateSchema`/`insertAppealTemplateSchema`)
on `POST /api/revenue/claims`, `/claims/bulk`, `/rates`, and `/appeal-templates`; invalid bodies now 400.
**R2-6 DONE** — deleted the dead root `src/` Next.js port (24 files) and dropped its only dependency
`@supabase/supabase-js` (8 packages removed from the lockfile).

### Open questions
- R2-1: does a `claim_number` unique constraint already exist in the live DB out-of-band? If not, imports are currently failing.
- R2-2/R2-3: is ANALYST / FRONT_DESK *intended* to see all-location revenue & intake data? `permissions.md` is silent on `/api/revenue/*` and `/api/frontdesk/*` — looks like newer surfaces simply not yet wired to scope.
- R2-6: is the root `src/` dir / `@supabase/supabase-js` reserved for a planned migration? If so, keep.
