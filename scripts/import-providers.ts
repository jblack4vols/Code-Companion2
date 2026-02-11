import XLSX from "xlsx";
import { db } from "../server/db";
import { physicians } from "../shared/schema";
import { sql } from "drizzle-orm";

function formatPhone(raw: any): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return digits || null;
}

function formatZip(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw);
  if (s.length === 9 && !s.includes("-")) {
    return s.slice(0, 5) + "-" + s.slice(5);
  }
  return s;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function main() {
  const wb = XLSX.readFile("attached_assets/Referring_Provider_List_1770804123657.xlsx");
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`Read ${rows.length} rows from Excel`);

  const seen = new Set<string>();
  const toInsert: any[] = [];

  for (const row of rows) {
    const npi = row["Contact NPI"] ? String(row["Contact NPI"]) : null;
    if (npi && seen.has(npi)) continue;
    if (npi) seen.add(npi);

    const street1 = row["Default Contact Street 1"] || "";
    const street2 = row["Default Contact Street 2"] || "";
    const address = [street1, street2].filter(Boolean).join(", ");

    toInsert.push({
      firstName: titleCase(String(row["Contact First Name"] || "").trim()),
      lastName: titleCase(String(row["Contact Last Name"] || "").trim()),
      credentials: row["Contact Credentials"] || null,
      specialty: row["Contact Credentials"] || null,
      npi,
      practiceName: row["Business/Company Name"] || null,
      primaryOfficeAddress: address || null,
      city: row["Default Contact City"] ? titleCase(String(row["Default Contact City"])) : null,
      state: row["Default Contact State"] || null,
      zip: formatZip(row["Default Contact Zip"]),
      phone: formatPhone(row["Default Contact Phone"]),
      fax: formatPhone(row["Default Contact Fax"]),
      email: row["Default Contact Email"] || null,
      status: "PROSPECT" as const,
      relationshipStage: "NEW" as const,
      priority: "MEDIUM" as const,
    });
  }

  console.log(`Prepared ${toInsert.length} unique providers to insert`);

  await db.execute(sql`
    DELETE FROM physicians 
    WHERE id NOT IN (SELECT DISTINCT physician_id FROM interactions)
    AND id NOT IN (SELECT DISTINCT physician_id FROM referrals)
    AND id NOT IN (SELECT DISTINCT physician_id FROM tasks)
    AND id NOT IN (SELECT DISTINCT physician_id FROM calendar_events WHERE physician_id IS NOT NULL)
  `);
  console.log("Cleared unlinked seed physicians");

  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    await db.insert(physicians).values(chunk);
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  const final = await db.execute(sql`SELECT count(*) as cnt FROM physicians`);
  console.log(`Done! Total physicians in database: ${(final.rows[0] as any).cnt}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
