# BCBS Audit Status Panel

Status: in progress · Branch: `claude/confident-gauss-XJhcZ` · 2026-10-13

## Goal
Close the last roadmap gap: a payer-scoped audit status panel for Blue Cross Blue Shield.
Reuses the existing revenue-recovery data layer (`claims`, `appeals`) — no new tables.

## Scope (YAGNI)
Read-only dashboard, gated OWNER/DIRECTOR/ANALYST. Defaults to BCBS payer matching
(`payer ILIKE '%blue%' OR '%bcbs%'`); accepts `payer`/`dateFrom`/`dateTo` overrides.

## Deliverables
- `server/storage-bcbs-audit.ts` — `getBcbsAuditStatus()`: KPIs, status buckets, flagged claims.
- `GET /api/revenue/bcbs-audit` in `server/routes/revenue-recovery.ts` (READ role).
- `client/src/pages/revenue-bcbs-audit.tsx` — KPI cards + status breakdown + flagged claims table.
- Wire route `/revenue/bcbs-audit` in `App.tsx`; sidebar item "BCBS Audit".
- `server/__tests__/bcbs-audit-logic.test.ts` — pure-logic tests (payer match, at-risk, recovery %, bucketing).

## KPIs
- Total claims under audit, total billed, total paid
- $ at risk = Σ underpaid + Σ (billed−paid) on DENIED claims
- Open appeals (DRAFTED/SUBMITTED), appeal win rate %

## Notes / unresolved
- CRM claims table has no recoupment/offset columns (BCBS TN strapping audit specifics live in
  the `bcbs-audit` Claude skill, not the CRM). Panel scopes to claim-lifecycle + exposure.
- Container is fresh (no node_modules/DB); tsc & vitest not executed here — verify in CI.
