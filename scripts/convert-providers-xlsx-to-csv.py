#!/usr/bin/env python3
"""
Convert the canonical Tristar PT referring-providers xlsx into a CSV that the
CRM's existing /api/import/physicians flow can upload directly.

Usage:
  python3 scripts/convert-providers-xlsx-to-csv.py <input.xlsx> [output.csv]

Defaults output to scripts/data/tristar-referring-providers-import.csv

What it does:
- Reads the "Providers" sheet (skips the title rows).
- Resolves Excel formula values (data_only=True) so cells like Parent
  Organization come through as strings, not "=IFERROR(...)".
- Splits "Provider Name" (e.g., "ANGELO SORCE") into firstName / lastName,
  title-casing the all-caps source.
- Maps the columns the existing /import flow knows about (firstName, lastName,
  npi, credentials, specialty, practiceName, address1, city, state, zip,
  phone, fax). Address uses the Provider-level fields (where they actually
  practice), not the practice-group fields.
- Stuffs every other Excel column (parent org, lifecycle tier, top clinic,
  top payer type, distance, marketer notes, referral counts, etc.) into
  custom-field columns prefixed `cf_` so the importer's customFieldMapping
  picks them up. The CRM's physicians.customFields jsonb column stores them.
- Skips rows missing NPI (the dedup key) — should be zero in practice; the
  source has 100% NPI coverage.
"""
from __future__ import annotations
import csv
import sys
from pathlib import Path

import openpyxl


SOURCE_HEADERS = [
    "Cases YTD 2026",
    "Cases 2025",
    "Cases All-Time",
    "Last Referral",
    "Provider Name",
    "Credentials",
    "Specialty",
    "Provider NPI (Type-1)",
    "Business Name (raw EMR)",
    "Provider Street",
    "Provider City",
    "State",
    "Provider Zip",
    "Provider Phone",
    "Provider Fax",
    "Practice Group NPI (Type-2)",
    "Practice Group Name",
    "Parent Organization",
    "Practice Group Street",
    "Practice Group City",
    "Practice Group State",
    "Practice Group Zip",
    "Practice Group Phone",
    "Practice Group Website",
    "Top Clinic Referred",
    "Top Payer Type",
    "Nearest Tristar Clinic",
    "Distance (mi)",
    "Lifecycle Tier",
    "Data Quality Flag",
    "Outreach Status",
    "Last Outreach",
    "Marketer Notes",
    "Assigned Marketer",
]


# Output columns the CRM importer maps directly via its standard mapping.
# Anything else falls into a cf_<slug> custom field column.
NATIVE_COLS = [
    "firstName",
    "lastName",
    "credentials",
    "specialty",
    "npi",
    "practiceName",
    "address1",
    "city",
    "state",
    "zip",
    "phone",
    "fax",
]

# Columns from the source that go into custom fields. Key = source header,
# value = output column name (cf_ prefix marks it as a custom field).
CUSTOM_FIELD_COLS = {
    "Cases YTD 2026": "cf_cases_ytd_2026",
    "Cases 2025": "cf_cases_2025",
    "Cases All-Time": "cf_cases_all_time",
    "Last Referral": "cf_last_referral",
    "Business Name (raw EMR)": "cf_business_name_emr",
    "Practice Group NPI (Type-2)": "cf_practice_group_npi",
    "Parent Organization": "cf_parent_organization",
    "Practice Group Phone": "cf_practice_group_phone",
    "Practice Group Website": "cf_practice_group_website",
    "Top Clinic Referred": "cf_top_clinic_referred",
    "Top Payer Type": "cf_top_payer_type",
    "Nearest Tristar Clinic": "cf_nearest_tristar_clinic",
    "Distance (mi)": "cf_distance_miles",
    "Lifecycle Tier": "cf_lifecycle_tier",
    "Data Quality Flag": "cf_data_quality_flag",
    "Outreach Status": "cf_outreach_status",
    "Last Outreach": "cf_last_outreach",
    "Marketer Notes": "cf_marketer_notes",
    "Assigned Marketer": "cf_assigned_marketer",
}


def split_name(full: str) -> tuple[str, str]:
    """ANGELO SORCE -> (Angelo, Sorce). VAN HALEN MARK -> (Mark, Van Halen)."""
    name = (full or "").strip()
    if not name:
        return "", ""
    parts = [p for p in name.split() if p]
    if len(parts) == 1:
        return "", parts[0].title()
    # Source is "FIRST LAST" or "FIRST MIDDLE LAST". Last token is last name,
    # everything before is first name. There are no comma-inverted entries.
    first = " ".join(parts[:-1]).title()
    last = parts[-1].title()
    return first, last


def stringify(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"Source file not found: {src}", file=sys.stderr)
        return 2
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(
        "scripts/data/tristar-referring-providers-import.csv"
    )
    out.parent.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb["Providers"]
    rows = list(ws.iter_rows(values_only=True))
    headers = rows[3]  # Row 4 in Excel = title row 1, blurb row 2, blank row 3, headers row 4
    if list(headers) != SOURCE_HEADERS:
        print(
            "Source headers do not match expected layout. Expected:\n"
            f"  {SOURCE_HEADERS}\nGot:\n  {list(headers)}",
            file=sys.stderr,
        )
        return 1

    out_cols = NATIVE_COLS + list(CUSTOM_FIELD_COLS.values())
    written = 0
    skipped_no_npi = 0

    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=out_cols)
        writer.writeheader()
        for row in rows[4:]:
            record = dict(zip(SOURCE_HEADERS, row))
            npi = stringify(record.get("Provider NPI (Type-1)"))
            if not npi:
                skipped_no_npi += 1
                continue
            first, last = split_name(stringify(record.get("Provider Name")))
            zip_raw = stringify(record.get("Provider Zip"))
            zip5 = zip_raw.zfill(5)[:5] if zip_raw else ""

            mapped = {
                "firstName": first,
                "lastName": last,
                "credentials": stringify(record.get("Credentials")),
                "specialty": stringify(record.get("Specialty")),
                "npi": npi,
                "practiceName": stringify(record.get("Practice Group Name")),
                "address1": stringify(record.get("Provider Street")).title() or "",
                "city": stringify(record.get("Provider City")).title() or "",
                "state": stringify(record.get("State")).upper() or "",
                "zip": zip5,
                "phone": stringify(record.get("Provider Phone")),
                "fax": stringify(record.get("Provider Fax")),
            }
            for src_h, out_h in CUSTOM_FIELD_COLS.items():
                mapped[out_h] = stringify(record.get(src_h))
            writer.writerow(mapped)
            written += 1

    print(f"Wrote {written} rows to {out}")
    if skipped_no_npi:
        print(f"Skipped {skipped_no_npi} rows missing NPI", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
