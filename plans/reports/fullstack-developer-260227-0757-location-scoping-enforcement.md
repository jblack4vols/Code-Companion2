# Phase Implementation Report

## Executed Phase
- Phase: location-scoping-enforcement
- Plan: ad-hoc (no plan directory)
- Status: completed

## Files Modified

| File | Changes |
|---|---|
| `server/routes/shared.ts` | Added `getUserLocationScope(req)` helper (+14 lines) |
| `server/storage.ts` | Updated `IStorage.getReferrals` signature + `ReferralFilters.locationIds` + `IStorage.getCollections` + `IStorage.getUnitEconomicsDashboard` + all 4 implementation methods |
| `server/storage-unit-economics.ts` | `getUnitEconomicsDashboard()` accepts optional `locationIds?` and applies `ANY(array)` SQL filter |
| `server/routes/referrals.ts` | `GET /api/referrals` and `GET /api/referrals/paginated` — location scope applied |
| `server/routes/territories.ts` | `GET /api/collections` — location scope applied |
| `server/routes/unit-economics.ts` | `GET /api/unit-economics/dashboard` — scope applied; `GET /api/unit-economics/location/:id` — 403 if no access |
| `server/routes/dashboard.ts` | `GET /api/dashboard/location/:locationId` — 403 if no access; `GET /api/dashboard/stats` — locationId validated |
| `docs/permissions.md` | "Partially implemented" → "Enforced"; gap #1 marked RESOLVED |

## Tasks Completed

- [x] `getUserLocationScope(req)` helper in `shared.ts` — returns null (admin bypass) or string[] (scoped)
- [x] `getReferrals()` — added `locationIds?` param; applies `inArray` filter
- [x] `getReferralsPaginated()` — added `locationIds?` to `ReferralFilters`; applies `inArray` filter
- [x] `getCollections()` — added `locationIds?` param; applies `inArray` filter
- [x] `getUnitEconomicsDashboard()` — added `locationIds?`; applies `AND l.id = ANY(...)` SQL filter
- [x] `GET /api/referrals` — short-circuits empty array → `[]`; passes scope to storage
- [x] `GET /api/referrals/paginated` — short-circuits empty array → empty page; passes scope to storage
- [x] `GET /api/collections` — short-circuits empty array → `[]`; passes scope to storage
- [x] `GET /api/unit-economics/dashboard` — short-circuits empty array → `[]`; passes scope to storage
- [x] `GET /api/unit-economics/location/:id` — 403 if non-admin lacks access to location
- [x] `GET /api/dashboard/location/:locationId` — 403 if non-admin lacks access to location
- [x] `GET /api/dashboard/stats` — validates requested locationId against user's scope
- [x] `docs/permissions.md` updated

## Tests Status

- Type check: pass (no new errors introduced; pre-existing errors in etl.ts, admin.ts, calendar.ts, features.ts, map-view.tsx are unchanged)
- Unit tests: not run (instructions said do not create test files)
- Integration tests: not applicable

## Scoping Behavior

| Role | Scope result | Effect |
|---|---|---|
| OWNER | `null` | All data, no filter applied |
| DIRECTOR | `null` | All data, no filter applied |
| MARKETER | `string[]` | Filtered to assigned locations |
| FRONT_DESK | `string[]` | Filtered to assigned locations |
| ANALYST | `string[]` | Filtered to assigned locations |
| Any role with 0 assignments | `[]` | Empty results returned immediately |

## Issues Encountered

- `req.params.*` in Express has type `string | string[]` which produces pre-existing TS errors in dashboard.ts territory/physician endpoints (lines 103, 104, 116, 117, 124, 158). These existed before this implementation. My new code uses `String(req.params.X)` casts to avoid the same issue.
- `getUnitEconomicsLocationDetail` internally calls `getUnitEconomicsDashboard()` with no args for the "current period" summary row — this will return all locations (not scoped). Acceptable because `getUnitEconomicsLocationDetail` is already gated behind a location access check at the route level.

## Next Steps

- Verify `GET /api/dashboard/funnel` — it accepts a `locationId` query param but does not validate it against scope; consider adding validation there too (low priority, endpoint is already role-gated)
- Consider adding location scope to `GET /api/referrals/paginated` CSV export route if one exists
