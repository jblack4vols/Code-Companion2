#!/usr/bin/env python3
"""
Convert the Tristar "Created Cases" YTD report xlsx into a CSV the CRM
referrals seeder consumes.

Source columns (single sheet, no title rows — headers in row 0):
  Patient Account Number, Patient Name, Case Title, Case Therapist,
  Case Facility, Case Status, Date of Initial Eval, Primary Insurance,
  Primary Member ID, Primary Policy Notes, Primary Payer Type,
  Primary Plan Name, Prim. Req. Auth, Primary Copay, ... (and more),
  Referring Doctor, Referring Doctor NPI, Referral Source,
  Discharge Date, Scheduled Visits, Arrived Visits, Discharge Note Generated,
  Discharge Reason, Created Date, Date of First Scheduled Visit,
  Date of First Arrived Visit, Created to Arrived, Related Cause, RTM Status,
  Other Contact 1..3 (+ Company / Title), Discipline,
  Missed Visit Alerted, Patient Diagnosis Category.

Output schema (referral seed):
  patientAccountNumber, patientFullName, caseTitle, caseTherapist,
  facilityName, status, referralDate, dateOfInitialEval,
  dischargeDate, dischargeReason, scheduledVisits, arrivedVisits,
  dateOfFirstScheduledVisit, dateOfFirstArrivedVisit, createdToArrived,
  primaryInsurance, primaryPayerType, referringProviderName,
  referringProviderNpi, referralSource, discipline, diagnosisCategory.

Status mapping:
  Excel "Discharged" → DISCHARGED
  Excel "Active" + arrivedVisits>0 → EVAL_COMPLETED
  Excel "Active" + scheduledVisits>0 → SCHEDULED
  Excel "Active" + neither → RECEIVED
  Anything else → RECEIVED
"""
from __future__ import annotations
import csv
import sys
from datetime import datetime
from pathlib import Path

import openpyxl


OUT_COLS = [
    "patientAccountNumber",
    "patientFullName",
    "caseTitle",
    "caseTherapist",
    "facilityName",
    "status",
    "referralDate",
    "dateOfInitialEval",
    "dischargeDate",
    "dischargeReason",
    "scheduledVisits",
    "arrivedVisits",
    "dateOfFirstScheduledVisit",
    "dateOfFirstArrivedVisit",
    "createdToArrived",
    "primaryInsurance",
    "primaryPayerType",
    "referringProviderName",
    "referringProviderNpi",
    "referralSource",
    "discipline",
    "diagnosisCategory",
]


def fmt_date(v) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    s = str(v).strip()
    if not s:
        return ""
    # Excel may give "01/05/2026" string format
    parts = s.split("/")
    if len(parts) == 3:
        m, d, y = parts
        if len(y) == 2:
            y = "20" + y
        try:
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        except ValueError:
            return ""
    return s if s.startswith("20") else ""  # ISO already, or unknown


def fmt_int(v) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, (int, float)):
        return str(int(v))
    s = str(v).strip()
    return s if s.isdigit() else ""


def fmt_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def derive_status(excel_status: str, scheduled: str, arrived: str) -> str:
    es = (excel_status or "").lower()
    if "discharg" in es:
        return "DISCHARGED"
    sched = int(scheduled) if scheduled.isdigit() else 0
    arrv = int(arrived) if arrived.isdigit() else 0
    if "active" in es:
        if arrv > 0:
            return "EVAL_COMPLETED"
        if sched > 0:
            return "SCHEDULED"
    return "RECEIVED"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"Source file not found: {src}", file=sys.stderr)
        return 2
    out = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else Path("scripts/data/tristar-created-cases-ytd-import.csv")
    )
    out.parent.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    headers = [str(h or "").strip() for h in rows[0]]

    def col_idx(name: str) -> int:
        try:
            return headers.index(name)
        except ValueError:
            return -1

    cols = {
        h: col_idx(h)
        for h in [
            "Patient Account Number",
            "Patient Name",
            "Case Title",
            "Case Therapist",
            "Case Facility",
            "Case Status",
            "Date of Initial Eval",
            "Primary Insurance",
            "Primary Payer Type",
            "Referring Doctor",
            "Referring Doctor NPI",
            "Referral Source",
            "Discharge Date",
            "Scheduled Visits",
            "Arrived Visits",
            "Discharge Reason",
            "Created Date",
            "Date of First Scheduled Visit",
            "Date of First Arrived Visit",
            "Created to Arrived",
            "Discipline",
            "Patient Diagnosis Category",
        ]
    }

    missing = [k for k, v in cols.items() if v < 0]
    if missing:
        print(f"Source missing required columns: {missing}", file=sys.stderr)
        return 1

    written = 0
    skipped_no_account = 0
    skipped_no_referral_date = 0

    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=OUT_COLS)
        writer.writeheader()

        for raw in rows[1:]:

            def get(name: str):
                idx = cols[name]
                return raw[idx] if 0 <= idx < len(raw) else None

            account_number = fmt_str(get("Patient Account Number"))
            if not account_number:
                skipped_no_account += 1
                continue
            referral_date = fmt_date(get("Created Date"))
            if not referral_date:
                skipped_no_referral_date += 1
                continue
            scheduled = fmt_int(get("Scheduled Visits"))
            arrived = fmt_int(get("Arrived Visits"))
            status = derive_status(
                fmt_str(get("Case Status")), scheduled, arrived
            )
            writer.writerow(
                {
                    "patientAccountNumber": account_number,
                    "patientFullName": fmt_str(get("Patient Name")),
                    "caseTitle": fmt_str(get("Case Title")),
                    "caseTherapist": fmt_str(get("Case Therapist")),
                    "facilityName": fmt_str(get("Case Facility")),
                    "status": status,
                    "referralDate": referral_date,
                    "dateOfInitialEval": fmt_date(get("Date of Initial Eval")),
                    "dischargeDate": fmt_date(get("Discharge Date")),
                    "dischargeReason": fmt_str(get("Discharge Reason")),
                    "scheduledVisits": scheduled,
                    "arrivedVisits": arrived,
                    "dateOfFirstScheduledVisit": fmt_date(
                        get("Date of First Scheduled Visit")
                    ),
                    "dateOfFirstArrivedVisit": fmt_date(
                        get("Date of First Arrived Visit")
                    ),
                    "createdToArrived": fmt_int(get("Created to Arrived")),
                    "primaryInsurance": fmt_str(get("Primary Insurance")),
                    "primaryPayerType": fmt_str(get("Primary Payer Type")),
                    "referringProviderName": fmt_str(get("Referring Doctor")),
                    "referringProviderNpi": fmt_str(get("Referring Doctor NPI")),
                    "referralSource": fmt_str(get("Referral Source")),
                    "discipline": fmt_str(get("Discipline")),
                    "diagnosisCategory": fmt_str(get("Patient Diagnosis Category")),
                }
            )
            written += 1

    print(f"Wrote {written} rows to {out}")
    if skipped_no_account:
        print(f"Skipped {skipped_no_account} rows missing Patient Account Number", file=sys.stderr)
    if skipped_no_referral_date:
        print(f"Skipped {skipped_no_referral_date} rows missing Created Date", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
