# Phase Implementation Report

### Executed Phase
- Phase: authz-improvements (5 items)
- Plan: none (ad-hoc)
- Status: completed

### Files Modified

| File | Change |
|------|--------|
| `server/storage.ts` | Added imports for `interactionTemplates`, `physicianStageHistory`, `InteractionTemplate`, `PhysicianStageHistory`; added 5 methods to `IStorage` interface; added 5 implementations to `DatabaseStorage` |
| `shared/schema.ts` | Added `locationIds: json("location_ids").$type<string[]>()` field to `apiKeys` table |
| `server/routes/users.ts` | Added `GET /api/user/locations` endpoint (location scoping) |
| `server/routes/templates.ts` | Full rewrite: removed direct `db` imports, all 4 routes now use `storage.*` methods |
| `server/routes/features.ts` | `GET /api/physicians/:id/stage-history` now uses `storage.getPhysicianStageHistory()` |
| `server/routes/integrations.ts` | GHL pull sync: preloaded physicians + existing referrals before loop; replaced 2 per-contact DB queries with in-memory map lookups; cache newly created physicians within batch |
| `server/routes/publicApi.ts` | Added `getApiKeyLocationIds()` helper; added `locationIds` to create schema; filter referrals/locations/interactions by key's location scope (backward-compatible) |

### Tasks Completed

- [x] Item 1: `getUserLocationIds(userId)` in IStorage + DatabaseStorage; `GET /api/user/locations` endpoint
- [x] Item 2: `getInteractionTemplates`, `createInteractionTemplate`, `updateInteractionTemplate`, `deleteInteractionTemplate` in IStorage + DatabaseStorage; templates.ts routes use storage layer
- [x] Item 3: N+1 fix in GHL pull sync — preload physicians (Map by NPI + name) + existing GHL referrals (Set by patient+date) before loop; in-memory dedup replaces per-contact DB queries
- [x] Item 4: `getPhysicianStageHistory(physicianId)` in IStorage + DatabaseStorage; stage-history route uses storage method
- [x] Item 5: `locationIds` added to `apiKeys` schema; `requireApiKey` middleware exposes `apiKeyId`; public referral/location/interaction endpoints filter by key's locationIds when set

### Tests Status
- Type check: 113 errors (baseline was 122 — reduced by 9, zero new errors introduced)
- Unit tests: 37/37 pass (`npx vitest run`)
- Integration tests: N/A

### Issues Encountered
- `features.ts` scorecard route (lines 72–82) still uses direct `db` queries for inline joins — only the standalone `/stage-history` route was migrated per task scope; scorecard is a complex multi-join that's out of scope
- `publicApi.ts` and `templates.ts` session type errors (`string | string[]`) are pre-existing across the codebase, not introduced by these changes
- `apiKeys.locationIds` schema field added — requires a DB migration to materialize (`ALTER TABLE api_keys ADD COLUMN location_ids json DEFAULT '[]'`). Not run here as migration tooling was not in scope

### Next Steps
- Run DB migration to add `location_ids` column to `api_keys` table
- Consider server-side enforcement of location scoping on `getInteractions`, `getReferrals`, `getPhysicians` queries (currently frontend-side only)
- Scorecard route in `features.ts` could be further refactored to use storage methods
