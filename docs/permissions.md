# Permissions & Authorization

## Roles

| Role | Description | Count in seed |
|---|---|---|
| OWNER | Full admin, bypasses all role checks | 1 |
| DIRECTOR | Management, most admin ops | 1 |
| MARKETER | Field rep, physician relationship management | 1 |
| FRONT_DESK | Clinic front desk, referral data entry | 1 |
| ANALYST | Read-only analytics and exports | 1 |

OWNER always bypasses `requireRole()` — hardcoded in middleware.

## Authentication

- Session-based (cookie), `connect-pg-simple` store in PostgreSQL
- 15 min rolling session timeout
- bcryptjs cost factor 12
- Account lockout: 10 failed attempts → 5 min lock
- Self-registration creates PENDING user; OWNER must approve
- CSRF: custom double-submit cookie (skipped for API-key and `/api/public/*` requests)
- Seed passwords: warns to console if default weak passwords are used in production

## Role-Permission Matrix

Legend: **C**=Create **R**=Read **U**=Update **D**=Delete

| Resource | OWNER | DIRECTOR | MARKETER | FRONT_DESK | ANALYST |
|---|---|---|---|---|---|
| Users (CRUD) | CRUD | - | - | - | - |
| User list (read) | R (full) | R (full) | R (id+name only) | R (id+name only) | R (id+name only) |
| Physicians | CRUD | CRUD | CRU (assigned only) | R | R |
| Physician assign/merge/bulk | Yes | Yes | - | - | - |
| Referrals | CRUD | CRU+D | CRU (owner only) | CRU | R |
| Referral delete-all/restore | Yes | - | - | - | - |
| Interactions | CRUD | CRUD | CRUD (owner only) | R | R |
| Tasks (read) | R | R | R | R | R |
| Tasks (create) | C | C | C | - | - |
| Tasks (update own) | U | U | U | U | U |
| Calendar events | CRUD | CRUD | CRUD (owner only) | R | R |
| Locations | CRUD | CRU | R | R | R |
| Territories | CRUD | CRU | R | R | R |
| Collections (financial) | CR | CR | - | - | R |
| ROI / provider financial | R | R | - | - | R |
| Dashboard executive | R | R | - | - | R |
| Dashboard territory/location | R | R | R | R | R |
| Dashboard hit-list | R (all) | R (all) | R (own only) | R (own only) | R (all) |
| Leaderboard | R | R | - | - | R |
| Tiering weights | RU | R | - | - | R |
| ETL trigger | Yes | Yes | - | - | - |
| Exports (CSV) | Yes | Yes | - | - | Yes |
| Audit logs | R | R | - | - | - |
| Audit retention/purge | Yes | - | - | - | - |
| Import (Excel/CSV) | Yes | Yes | - | - | - |
| Scheduled reports | CRUD | CRUD | - | - | - |
| Integrations config | CRUD | CRUD | - | - | - |
| SharePoint sync | Yes | Yes | - | - | - |
| API keys | CRUD | - | - | - | - |
| Public API | Scoped by API key + locationIds | | | | |
| Goals | CRUD | CRUD | R | R | R |
| Interaction templates | R | CRUD | R | R | R |
| Search / favorites | R | R | R | R | R |
| Unlinked referral linking | Yes | Yes | - | - | - |
| User locations | R (own) | R (own) | R (own) | R (own) | R (own) |

## Ownership Enforcement

Mutation endpoints enforce that non-admin users can only modify records they own. OWNER and DIRECTOR roles bypass all ownership checks.

| Resource | Ownership field | Enforced on | Bypass roles |
|---|---|---|---|
| Interactions | `userId` (creator) | PATCH, DELETE, RESTORE | OWNER, DIRECTOR |
| Tasks | `assignedToUserId` | PATCH | OWNER, DIRECTOR |
| Calendar events | `organizerUserId` | PATCH, DELETE | OWNER, DIRECTOR |
| Referrals | `physician.assignedOwnerId` | PATCH | OWNER, DIRECTOR |
| Physicians | `assignedOwnerId` | PATCH (MARKETER blocked from unassigned) | OWNER, DIRECTOR |

Non-owners receive `403 Forbidden` with a descriptive message.

### Financial Endpoint Guards

| Endpoint | Previous guard | Current guard |
|---|---|---|
| `GET /api/collections` | `requireAuth` | `requireRole(OWNER, DIRECTOR, ANALYST)` |
| `GET /api/roi/providers` | `requireAuth` | `requireRole(OWNER, DIRECTOR, ANALYST)` |

FRONT_DESK and MARKETER no longer have access to collections or ROI data.

## Location Scoping

**Partially implemented.**

- `user_location_access` junction table maps users to locations
- `getUserLocationIds()` storage method reads this table and returns a user's allowed location IDs
- `GET /api/user/locations` endpoint exposes location list to the client
- API keys now carry a `locationIds` field — public API queries are filtered to those locations
- Dashboard hit-list scoped to current user for non-admin roles (MARKETER, FRONT_DESK)
- Full server-side query enforcement (joining `user_location_access` in every storage query) is **not yet implemented** — users can still see cross-location data via unfiltered list endpoints

## Territory Scoping

**Not enforced.** `territoryId` on physicians is a filter parameter, not a server-side gate. Any user can query any territory's data.

## User List Protection

`GET /api/users`:
- OWNER / DIRECTOR: full user objects (email, role, status, etc.)
- All other roles: `{ id, name }` only — emails and roles not exposed

## Identified Gaps

### Critical

| # | Gap | Risk | Location |
|---|---|---|---|
| 1 | `user_location_access` — partial enforcement only | Cross-location data leakage for list endpoints | Entire storage layer |

### High

| # | Gap | Risk | Location |
|---|---|---|---|
| 5 | ~~No ownership check on physician edit~~ | **RESOLVED** — MARKETER blocked from editing unassigned physicians | `server/routes/physicians.ts` |
| 6 | ~~No ownership check on referral edit~~ | **RESOLVED** — ownership via `physician.assignedOwnerId` | `server/routes/referrals.ts` |

### Previously Identified (now resolved)

| # | Gap | Resolution |
|---|---|---|
| 2 | `PATCH /api/tasks/:id` — `requireAuth` only | **RESOLVED** — ownership check added (Phase 1) |
| 3 | `GET /api/users` — full list for all roles | **RESOLVED** — non-admin roles receive `{id, name}` only |
| 4 | No ownership check on interaction edit/delete | **RESOLVED** — ownership check added (Phase 1) |
| 7 | No ownership check on calendar event edit/delete | **RESOLVED** — ownership check added (Phase 1) |
| 8 | `GET /api/collections` — `requireAuth` only | **RESOLVED** — `requireRole(OWNER, DIRECTOR, ANALYST)` |
| 9 | Public API returns all data with no location filter | **RESOLVED** — `locationIds` field on API keys scopes queries |
| 10 | `GET /api/dashboard/hit-list` — all reps visible | **RESOLVED** — scoped to current user for non-admin roles |
| 11 | Duplicate auth middleware definitions | **RESOLVED** — `middleware/auth.ts` re-exports from `routes/shared.ts` |
| 12 | Default seed passwords in production | **RESOLVED** — warns to console if weak defaults active |
| 13 | Hardcoded SMTP config | **RESOLVED** — moved to `SMTP_USER`, `SMTP_HOST`, `SMTP_PORT` env vars |
| 14 | `passport`/`passport-local`/`csrf-csrf`/`memorystore` unused | **RESOLVED** — removed from `package.json` |
| 15 | API key location scoping missing | **RESOLVED** — `locationIds` field added to `api_keys` table |
