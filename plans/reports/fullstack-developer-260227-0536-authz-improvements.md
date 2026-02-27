# Phase Implementation Report

## Executed Phase
- Phase: authz-improvements (9 items)
- Plan: none (inline task list)
- Status: completed

## Files Modified

| File | Change |
|------|--------|
| `server/routes/users.ts` | +6 lines: role-filtered GET /api/users |
| `server/outlook.ts` | +1 line: SMTP config reads from env vars |
| `server/middleware/auth.ts` | Replaced with re-export from routes/shared.ts |
| `shared/schema.ts` | +1: FK `.references(() => territories.id)` on physicians.territoryId |
| `package.json` | Removed: passport, passport-local, csrf-csrf, memorystore; removed @types/passport, @types/passport-local |
| `server/seed.ts` | +8 lines: console.warn in production when SEED_*_PASSWORD not set |
| `server/routes/referrals.ts` | +13 lines: ownership check on PATCH; added eq/referralsTable imports |
| `server/routes/physicians.ts` | +10 lines: MARKETER ownership check on PATCH |
| `server/routes/dashboard.ts` | +5 lines: hit-list filtered by userId for non-OWNER/DIRECTOR |

## Tasks Completed

- [x] 1. Guard GET /api/users by role — OWNER/DIRECTOR get full data, others get `{id, name}` only
- [x] 2. SMTP config to env vars — SMTP_USER/SMTP_HOST/SMTP_PORT with fallback defaults
- [x] 3. Deduplicate auth middleware — middleware/auth.ts now re-exports from routes/shared.ts
- [x] 4. FK on physicians.territoryId — `.references(() => territories.id)` added
- [x] 5. Remove unused deps — passport, passport-local, csrf-csrf, memorystore removed + npm install run
- [x] 6. Seed password warning — console.warn emitted when env vars missing in production
- [x] 7. Referral mutation ownership — PATCH checks physician.assignedOwnerId vs session user
- [x] 8. Physician edit ownership — PATCH checks assignedOwnerId for MARKETER role
- [x] 9. Dashboard hit-list filtering — non-OWNER/DIRECTOR see only their own events/tasks/followUps

## Tests Status
- Type check: pass (89 errors before = 89 errors after — no new errors introduced)
- Unit tests: pass (37/37)
- Integration tests: n/a

## Issues Encountered

- `referrals` schema has no `userId`/`createdBy` field; used physician.assignedOwnerId as proxy for ownership (as instructed)
- `storage.getReferral(id)` did not exist; used inline `db.select()` instead
- Express v5 types `req.params.*` as `string | string[]` throughout codebase (pre-existing); added `as string` cast to the two new calls I introduced to avoid adding new TS errors
- `middleware/auth.ts` had `createAuditLogEntry` not in `routes/shared.ts` — the re-export omits that function (it was only in middleware/auth.ts, not imported anywhere in server code)

## Next Steps

- Schema FK addition (`physicians.territoryId -> territories.id`) requires a DB migration (`drizzle-kit push` or migration file) — no migration was run here
- Consider adding a single-referral getter (`getReferral(id)`) to storage interface to avoid ad-hoc `db.select()` in routes
