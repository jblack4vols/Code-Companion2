# At-Risk Referral Source Alerting (backlog #6)

Status: shipped · Branch: `claude/confident-gauss-XJhcZ` · 2026-10-13

## Goal
Close the last open P1: proactively notify leadership about at-risk referral sources
(referrals down >20% + no touchpoint in 30 days OR overdue follow-up).

## Finding
Detection and in-app surface already existed:
- `storage.getAtRiskReferralSources()` + `GET /api/at-risk-sources` (detection)
- `AtRiskReferralSourcesCard` on the main dashboard (in-app surface)

The only missing piece was the **proactive push**. Delivery chosen: in-app (already present) + email digest.

## Deliverables (email push only — KISS)
- `server/outlook.ts` — `sendAtRiskReferralDigestEmail()` (branded HTML table, link to /declining-referrals).
- `server/etl.ts` — `sendAtRiskReferralDigests()` orchestrator; emails OWNER/DIRECTOR; wired into the
  existing weekday digest cron (runs right after the overdue-task digest).
- `server/__tests__/at-risk-digest-logic.test.ts` — pure-logic tests (source mapping, signal label, recipient filter).
- Backlog doc marked #6 DONE.

## Verification
- `npx tsc --noEmit` clean; `npx vitest run` — 452 passed (5 new).

## Notes / unresolved
- Recipients = all OWNER/DIRECTOR users. If per-territory marketer targeting is wanted later, route by
  `physician.assignedOwnerId`/`territoryId` (data already on `AtRiskSourceEntry`).
- No persistent/acknowledgeable alert record added (financial_alerts is location-scoped + enum-typed);
  the in-app card already covers the on-screen surface. A dedicated acknowledgeable referral-alert table
  would be a follow-up requiring a schema migration.
