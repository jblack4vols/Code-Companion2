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

## Role-Permission Matrix

Legend: **C**=Create **R**=Read **U**=Update **D**=Delete

| Resource | OWNER | DIRECTOR | MARKETER | FRONT_DESK | ANALYST |
|---|---|---|---|---|---|
| Users (CRUD) | CRUD | - | - | - | - |
| User list (read) | R | R | R | R | R |
| Physicians | CRUD | CRUD | CRU | R | R |
| Physician assign/merge/bulk | Yes | Yes | - | - | - |
| Referrals | CRUD | CRU+D | CRU | CRU | R |
| Referral delete-all/restore | Yes | - | - | - | - |
| Interactions | CRUD | CRUD | CRUD | R | R |
| Tasks (read) | R | R | R | R | R |
| Tasks (create) | C | C | C | - | - |
| Tasks (update own) | U | U | U | U | U |
| Calendar events | CRUD | CRUD | CRUD | R | R |
| Locations | CRUD | CRU | R | R | R |
| Territories | CRUD | CRU | R | R | R |
| Collections (financial) | CR | CR | - | - | R |
| Dashboard executive | R | R | - | - | R |
| Dashboard territory/location | R | R | R | R | R |
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
| Public API | Scoped by API key | | | | |
| Goals | CRUD | CRUD | R | R | R |
| Interaction templates | R | CRUD | R | R | R |
| Search / favorites | R | R | R | R | R |
| Unlinked referral linking | Yes | Yes | - | - | - |

## Ownership Enforcement (Phase 1)

Mutation endpoints enforce that non-admin users can only modify records they own. OWNER and DIRECTOR roles bypass all ownership checks.

| Resource | Ownership field | Enforced on | Bypass roles |
|---|---|---|---|
| Interactions | `userId` (creator) | PATCH, DELETE, RESTORE | OWNER, DIRECTOR |
| Tasks | `assignedToUserId` | PATCH | OWNER, DIRECTOR |
| Calendar events | `organizerUserId` | PATCH, DELETE | OWNER, DIRECTOR |

Non-owners receive `403 Forbidden` with a descriptive message.

### Financial Endpoint Guards

| Endpoint | Previous guard | Current guard |
|---|---|---|
| `GET /api/collections` | `requireAuth` | `requireRole(OWNER, DIRECTOR, ANALYST)` |
| `GET /api/roi/providers` | `requireAuth` | `requireRole(OWNER, DIRECTOR, ANALYST)` |

FRONT_DESK and MARKETER no longer have access to collections or ROI data.

## Location Scoping

**Designed but NOT enforced.**

The `user_location_access` junction table exists in the schema, mapping users to locations. However:
- No route or storage query joins against this table to restrict data access
- All location-filtered queries accept `locationId` as an optional client-supplied parameter
- Any authenticated user can view data across all locations by omitting the filter

**Impact:** A FRONT_DESK user at Location A can view/edit referrals from Location B. A MARKETER can see all physicians regardless of assigned territory.

## Territory Scoping

**Not enforced.** `territoryId` on physicians is a filter parameter, not a server-side gate. Any user can query any territory's data.

## Identified Gaps

### Critical

| # | Gap | Risk | Location |
|---|---|---|---|
| 1 | `user_location_access` unenforced | All users see all locations' data | Entire storage layer |
| 2 | ~~`PATCH /api/tasks/:id` — `requireAuth` only~~ | **RESOLVED** — ownership check added (Phase 1) | `server/routes/tasks.ts:50` |
| 3 | `GET /api/users` — `requireAuth` only | All users list exposed to every role | `server/routes/users.ts:9` |

### High

| # | Gap | Risk | Location |
|---|---|---|---|
| 4 | ~~No ownership check on interaction edit/delete~~ | **RESOLVED** — ownership check added (Phase 1) | `server/routes/interactions.ts` |
| 5 | No ownership check on physician edit | MARKETER can edit any physician, not just assigned | `server/routes/physicians.ts:316` |
| 6 | No ownership check on referral edit | FRONT_DESK can update referrals at other locations | `server/routes/referrals.ts:62` |
| 7 | ~~No ownership check on calendar event edit/delete~~ | **RESOLVED** — ownership check added (Phase 1) | `server/routes/calendar.ts` |
| 8 | ~~`GET /api/collections` — `requireAuth` only~~ | **RESOLVED** — `requireRole(OWNER,DIRECTOR,ANALYST)` (Phase 1) | `server/routes/territories.ts:47` |

### Medium

| # | Gap | Risk | Location |
|---|---|---|---|
| 9 | Public API returns all data per scope string | No location/territory filtering on API keys | `server/routes/publicApi.ts` |
| 10 | `GET /api/dashboard/hit-list` — `requireAuth` only | All reps' schedules visible to any user | `server/routes/dashboard.ts:351` |
| 11 | Duplicate auth middleware definitions | Could drift between `middleware/auth.ts` and `routes/shared.ts` | Both files |

### Low

| # | Gap | Risk | Location |
|---|---|---|---|
| 12 | Default seed passwords are weak | `change_me_owner` / `change_me_user` if env vars unset | `server/seed.ts` |
| 13 | Hardcoded SMTP user `jblack@tristarpt.com` | Should be env var | `server/outlook.ts:5` |
| 14 | `passport`/`passport-local` unused but installed | Dead dependencies | `package.json` |
