# Location Scoping — R2-2 + R2-3

Status: shipped · Branch: `claude/confident-gauss-XJhcZ` · 2026-10-14

## Goal
Enforce `getUserLocationScope()` on revenue + front-desk reads so location-scoped roles
(ANALYST, FRONT_DESK) only see their locations' data. OWNER/DIRECTOR unchanged (unscoped).

## Semantics
- `getUserLocationScope(req)`: `null` = OWNER/DIRECTOR (all), `[]` = scoped w/ no assignments, `[ids]` = those.
- Revenue/claims: row visible iff scope null OR `claim.location_id ∈ scope`. Empty scope → nothing.
- Front-desk: scoped staff also see **unrouted** requests (`location_preference IS NULL`) = shared intake queue.

## Changes (R2-2)
- `storage-revenue-recovery.ts`: `locationIds?: string[]` on `getClaims`/`getUnderpaidClaims`/`getReimbursementSummary`.
- `storage-denial-intelligence.ts`: `locationIds` on all four denial queries.
- `storage-bcbs-audit.ts`: `locationIds` filter.
- `routes/revenue-recovery.ts`: pass `(await getUserLocationScope(req)) ?? undefined` to every READ;
  single-claim detail 404s out-of-scope claims; inline by-payer/by-cpt raw SQL gained a scope fragment.

## Changes (R2-3)
- `routes/frontdesk.ts`: `/requests` + `/stats` scoped by `location_preference` (+ unrouted), slots by `location_id`.

## Tests
- `server/__tests__/location-scoping-logic.test.ts` — pure visibility rules (claim + request).
- `npx tsc --noEmit` clean; `npx vitest run` 459 passed (7 new).

## Notes / unresolved
- Front-desk "see unrouted (null) intakes" is a deliberate choice so new intakes aren't hidden from
  scoped staff. If leadership prefers unrouted PHI hidden from scoped staff, drop the `IS NULL` branch.
- Perf: scope adds `location_id = ANY($)`; `claims_location_idx` already supports it.
