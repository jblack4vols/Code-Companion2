# Import Tristar's Referring-Provider Roster

**Date:** 2026-05-07 18:10 UTC
**Source file:** `782e2ae5-11TristarPT_Referring_Providers.xlsx` (3,865 canonical providers)
**Output CSV:** `scripts/data/tristar-referring-providers-import.csv` (1.1 MB)
**Importer used:** the existing `/api/import/physicians` flow (NPI dedup + NPPES enrichment + audit logging — no new code)

---

## What's in the CSV

3,865 rows, every one has an NPI. Columns:

**Native importer fields (mapped automatically by the /import UI's defaults):**
- `firstName`, `lastName` (split + title-cased from the Excel "Provider Name" column)
- `credentials`, `specialty`, `npi`
- `practiceName` (from "Practice Group Name" — the canonical Type-2 NPPES name)
- `address1`, `city`, `state`, `zip`, `phone`, `fax` (Provider-level address, where they actually practice)

**Custom fields (`cf_*` columns — map to the importer's customFieldMapping):**
- `cf_cases_ytd_2026`, `cf_cases_2025`, `cf_cases_all_time`, `cf_last_referral`
- `cf_business_name_emr`, `cf_practice_group_npi`, `cf_parent_organization`, `cf_practice_group_phone`, `cf_practice_group_website`
- `cf_top_clinic_referred`, `cf_top_payer_type`, `cf_nearest_tristar_clinic`, `cf_distance_miles`
- `cf_lifecycle_tier`, `cf_data_quality_flag`, `cf_outreach_status`, `cf_last_outreach`, `cf_marketer_notes`, `cf_assigned_marketer`

The CRM stores those in `physicians.customFields` (jsonb). They show up on the physician detail page under "Custom Fields" and are searchable, but they aren't first-class columns yet (no enum gates, no dashboard tiles). If you want any of them surfaced as proper schema columns + slicers, that's a follow-up PR — see below.

---

## How to import (recommended path: through the CRM UI)

1. Sign in to `crm.tristarpt.com` as **OWNER** or **DIRECTOR** (the only roles allowed to import physicians per `server/routes/import.ts:120`).
2. Sidebar → Admin → **Import Data**.
3. Select **Referring Providers** as the import type.
4. Upload `scripts/data/tristar-referring-providers-import.csv`.
5. **Preview** — confirms how many rows would insert vs. update. Existing physicians are matched by **NPI**; ones already in your DB will UPDATE rather than duplicate.
6. **Map columns** — most defaults will Just Work because the CSV headers match the importer's expected names. For the `cf_*` columns, click **Add custom field mapping** for each one (they'll land in `physicians.customFields`).
7. Confirm. The importer:
   - Upserts each row by NPI.
   - **Calls NPPES** for any row missing fields the registry could fill (only writes to MISSING fields — never overwrites your CSV data, see `server/routes/import.ts:190`).
   - Writes an audit-log entry for the import action.

Estimated time: 2-5 minutes for the API round trips (3,865 NPPES calls, 100ms-rate-limited in batches of 10 per `import.ts:174`).

## Alternative: re-run the converter against a fresh xlsx

If your Excel changes and you want a new CSV:

```bash
python3 scripts/convert-providers-xlsx-to-csv.py path/to/new-roster.xlsx
```

Drops the output at `scripts/data/tristar-referring-providers-import.csv` (overwrites). Re-upload via the same /import UI. Existing rows update; new rows insert; nothing is deleted.

---

## What the import will look like in your dashboard

The CRM dashboard already has KPIs that should populate naturally once the data is in:

| Excel KPI | CRM equivalent | Notes |
|---|---|---|
| Total Providers | Provider count on Dashboard / Physicians list | Auto |
| Cases YTD 2026 | Sum of `referrals` rows where `referralDate >= 2026-01-01` | Auto, from referrals data |
| Cases 2025 | Same calc, 2025 window | Auto |
| Tier A Count | Count of physicians with `tierLabel = 'A'` on `physicianMonthlySummary` | Already wired; today's import seeds the mapping via `cf_lifecycle_tier` but the official `tierLabel` is computed nightly by `server/etl.ts` |
| Within 10 mi | Not currently a dashboard tile | Could add — distance lives in `cf_distance_miles` after import |
| Dormant (>180d) | "Declining" page already shows similar cohort | `/declining` route |
| Avg Cases/Provider | Not currently a dashboard tile | Easy follow-up |

So you should see provider counts and tier distribution shift the moment the import completes. The "Within 10 mi" / "Dormant >180d" / "Avg Cases/Provider" tiles aren't on the dashboard yet — separate PR if you want them.

---

## Things deliberately not in scope of this PR

- **Schema migration** to make `cf_lifecycle_tier`, `cf_outreach_status`, `cf_data_quality_flag`, `cf_marketer_notes` first-class columns with enums and UI affordances. Right now they're stored as customFields strings. If your team wants slicers/filters on these dimensions, the schema work is a follow-up (~2 hours).
- **Practice-group entity** — the Excel has a separate "Practice Groups" sheet (25 Type-2 NPI organizational records). The CRM stores `practiceName` as a string on each physician but has no first-class practice-groups table. If you want a navigable "view all providers at this practice" page, that's a separate PR (~3 hours; some scaffolding already exists at `provider-offices` and `provider-office-linker`).
- **Parent-organization rollup** — Excel has 19 parent orgs. Currently dropped on the floor (the formula-cached field came through empty for the rows I sampled). If you want the parent-org dimension in the CRM, scaffold a `parent_organizations` table or store on physician.customFields.parent_organization (which the import does — accessible as `physician.customFields.cf_parent_organization`).
- **Direct DB write from this script.** The script ONLY produces a CSV. The actual database mutation goes through the existing `/api/import/physicians` flow, which has auth + role gating + NPI dedup + NPPES enrichment + audit logging. This is the safer path — you keep full control with preview before commit.

---

## Risks / things to watch

1. **Existing physicians in your DB that aren't in this Excel.** They WILL be left alone (the importer upserts; it doesn't delete). If the Excel is intended to be your full source of truth, you may want to manually flag stale entries afterward, or run a query to find physicians not in the import.
2. **Excel had 13 stale formula cells** (Parent Organization XLOOKUP) that came through as empty in the CSV. Not a data-loss risk — the source xlsx still has them — but means parent_organization will be blank for some rows after import. If you want full parent-org coverage, re-save the xlsx with calc-on-save enabled, then re-run the converter.
3. **NPPES calls are rate-limited but not retried.** If NPPES hiccups for a batch, those rows get the CSV data only (no enrichment). The audit log records `enrichmentFailed` count.
4. **Custom field naming collisions.** If your team has been entering custom fields on physicians manually with names like `lifecycle_tier`, the new `cf_lifecycle_tier` from this import won't conflict (different key) but you may end up with duplicate-feeling fields in the UI. Worth a quick visual check after import.

---

## Unresolved questions

1. Do you want the `cf_*` fields surfaced as proper schema columns + slicers (separate ~2 hour PR)? Specifically `lifecycle_tier`, `outreach_status`, `data_quality_flag`?
2. Do you want a parent-organization rollup page (Excel "Parent Org Rollup" sheet has 19 orgs + provider counts)?
3. Should physicians in the DB but NOT in the Excel be auto-marked `INACTIVE`, or left alone?
4. The Excel includes a "Top Clinic Referred" / "Top Payer Type" per provider. These are derived from your referrals data already — worth a quick check that the CSV's values match what the CRM would compute live.
