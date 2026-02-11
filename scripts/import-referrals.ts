import XLSX from "xlsx";
import { db } from "../server/db";
import { referrals, physicians, locations } from "../shared/schema";
import { sql, eq } from "drizzle-orm";

function excelDateToISO(serial: any): string | null {
  if (!serial || typeof serial !== "number") return null;
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400000);
  return d.toISOString().split("T")[0];
}

function mapStatus(caseStatus: string, hasEval: boolean): "RECEIVED" | "SCHEDULED" | "EVAL_COMPLETED" | "DISCHARGED" | "LOST" {
  if (caseStatus === "Discharged") return "DISCHARGED";
  if (hasEval) return "EVAL_COMPLETED";
  return "SCHEDULED";
}

async function main() {
  const wb = XLSX.readFile("attached_assets/Created_Cases_Report_-_01-01-25_to_01-31-26_1770804583361.xlsx");
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`Read ${rows.length} rows from Excel`);

  const allLocations = await db.select().from(locations);
  const locationMap = new Map<string, string>();
  for (const loc of allLocations) {
    locationMap.set(loc.name, loc.id);
  }
  console.log("Locations:", [...locationMap.keys()]);

  const allPhysicians = await db.select().from(physicians);
  const npiMap = new Map<string, string>();
  for (const p of allPhysicians) {
    if (p.npi) npiMap.set(p.npi, p.id);
  }
  console.log(`Physician NPI map: ${npiMap.size} entries`);

  const toInsert: any[] = [];
  let noLocation = 0;
  let noPhysician = 0;

  for (const row of rows) {
    const facility = row["Case Facility"];
    const locationId = locationMap.get(facility);
    if (!locationId) {
      if (facility !== "Billing") noLocation++;
      continue;
    }

    const npi = row["Referring Doctor NPI"] ? String(row["Referring Doctor NPI"]) : null;
    const referringDoctorName = row["Referring Doctor"] || null;
    const physicianId = npi ? npiMap.get(npi) || null : null;
    if (npi && !physicianId) noPhysician++;

    const createdDate = excelDateToISO(row["Created Date"]);
    if (!createdDate) continue;

    const evalDate = excelDateToISO(row["Date of Initial Eval"]);
    const caseStatus = row["Case Status"] || "Active";

    const patientName = row["Patient Name"] || "";
    const nameParts = patientName.split(" ");
    const initials = nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : patientName.slice(0, 2).toUpperCase();

    toInsert.push({
      physicianId,
      locationId,
      referringProviderName: referringDoctorName,
      referringProviderNpi: npi,
      referralDate: createdDate,
      patientAccountNumber: row["Patient Account Number"] || null,
      patientInitialsOrAnonId: initials || "XX",
      patientFullName: patientName || null,
      caseTitle: row["Case Title"] || null,
      caseTherapist: row["Case Therapist"] || null,
      dateOfInitialEval: evalDate,
      referralSource: row["Referral Source"] || null,
      dischargeDate: excelDateToISO(row["Discharge Date"]),
      dischargeReason: row["Discharge Reason"] || null,
      scheduledVisits: typeof row["Scheduled Visits"] === "number" ? row["Scheduled Visits"] : 0,
      arrivedVisits: typeof row["Arrived Visits"] === "number" ? row["Arrived Visits"] : 0,
      discipline: row["Discipline"] || null,
      primaryInsurance: row["Primary Insurance"] || null,
      primaryPayerType: row["Primary Payer Type"] || null,
      dateOfFirstScheduledVisit: excelDateToISO(row["Date of First Scheduled Visit"]),
      dateOfFirstArrivedVisit: excelDateToISO(row["Date of First Arrived Visit"]),
      createdToArrived: typeof row["Created to Arrived"] === "number" ? row["Created to Arrived"] : null,
      diagnosisCategory: row["Patient Diagnosis Category"] || null,
      status: mapStatus(caseStatus, !!evalDate),
    });
  }

  console.log(`Prepared ${toInsert.length} referrals to insert`);
  console.log(`Skipped: ${noLocation} (no matching location), ${noPhysician} (no matching physician NPI)`);

  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    await db.insert(referrals).values(chunk);
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  const final = await db.execute(sql`SELECT count(*) as cnt FROM referrals`);
  console.log(`Done! Total referrals in database: ${(final.rows[0] as any).cnt}`);

  const matched = toInsert.filter(r => r.physicianId).length;
  console.log(`Matched to physician: ${matched}/${toInsert.length}`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
