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
