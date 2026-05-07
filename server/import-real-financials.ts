import { db } from "./db";
import { sql } from "drizzle-orm";
import XLSX from "xlsx";
import * as path from "path";

const locationMap: Record<string, string> = {
  "Tristar PT - Bean Station": "f4ceb9df-1228-4c2c-8508-958674738afd",
  "Tristar PT - Jefferson City": "36ec3065-2f3f-45bb-9203-07bd3faa7e55",
  "Tristar PT - Johnson City": "78a2e363-51b3-43dd-a8a6-8f69e3c8a7ff",
  "Tristar PT - Maryville": "820211c8-2e38-4a57-b56a-e8f00c9340e2",
  "Tristar PT - Morristown": "0f4114c0-a96e-4aad-9ab8-d39a8ce77863",
  "Tristar PT - New Tazewell": "6da09fb0-68c3-4474-9100-c42faf5511a0",
  "Tristar PT - Newport": "06f764ba-7752-4161-bd24-ec2eefff256e",
  "Tristar PT - Rogersville": "d06e8d70-deed-4bfd-a909-9ec7665a34ea",
};

function excelDateToISO(serial: number): string {
  const epoch = new Date(1899, 11, 30);
  const d = new Date(epoch.getTime() + serial * 86400000);
  return d.toISOString().split("T")[0];
}

function safeNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(String(val).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
}

function mapPayerType(raw: string | undefined): string {
  if (!raw) return "Other";
  if (raw.includes("Medicare") && raw.includes("HMO")) return "Medicare Advantage";
  if (raw.includes("Medicare")) return "Medicare";
  if (raw.includes("Medicaid")) return "Medicaid";
  if (raw.includes("Workers Comp")) return "Workers Comp";
  if (raw.includes("Veterans") || raw.includes("VA")) return "VA";
  if (raw.includes("Self Pay")) return "Self Pay";
  if (raw.includes("Commercial")) return "Commercial";
  if (raw.includes("HMO")) return "HMO";
  return "Commercial";
}

function mapStatus(visitStage: string, totalPaid: number, hanging: number): string {
  if (visitStage === "Closed") {
    if (totalPaid > 0) return "PAID";
    return "SUBMITTED";
  }
  if (visitStage === "Balance") return "PARTIAL";
  if (visitStage === "Review" || visitStage === "Approval") return "SUBMITTED";
  if (visitStage === "Open") {
    if (totalPaid > 0) return "PARTIAL";
    return "SUBMITTED";
  }
  return "SUBMITTED";
}

export async function importRealFinancials() {
  const existingReal = await db.execute(sql`SELECT count(*) as cnt FROM claims WHERE source = 'prompt-import'`);
  if (Number(existingReal.rows[0].cnt) > 100) {
    console.log("[Import] Real financial data already imported, skipping...");
    return;
  }

  console.log("[Import] Clearing seeded financial data...");
  await db.execute(sql`DELETE FROM appeals`);
  await db.execute(sql`DELETE FROM claim_payments`);
  await db.execute(sql`DELETE FROM claims WHERE source = 'seed'`);
  await db.execute(sql`DELETE FROM clinic_financials WHERE source = 'seed'`);

  const revenueFile = path.resolve("attached_assets/Revenue_Report_-_01-01-26_to_03-26-26_(1)_1774554438487.xlsx");
  const opsFile = path.resolve("attached_assets/Operations_Report_-_01-01-26_to_03-26-26_1774554438487.xlsx");

  console.log("[Import] Reading Revenue Report...");
  const revWb = XLSX.readFile(revenueFile);
  const revData: any[] = XLSX.utils.sheet_to_json(revWb.Sheets["All Data"]);
  console.log(`[Import] Revenue report: ${revData.length} rows`);

  console.log("[Import] Reading Operations Report...");
  const opsWb = XLSX.readFile(opsFile);
  const opsData: any[] = XLSX.utils.sheet_to_json(opsWb.Sheets["All Data"]);
  console.log(`[Import] Operations report: ${opsData.length} rows`);

  const physicianRows = await db.execute(sql`SELECT id, first_name, last_name FROM physicians`);
  const physicianLookup = new Map<string, string>();
  for (const p of physicianRows.rows as any[]) {
    const key = `${p.last_name}, ${p.first_name}`.toUpperCase();
    physicianLookup.set(key, p.id);
    physicianLookup.set(p.last_name.toUpperCase(), p.id);
  }

  function findPhysician(name: string | undefined): string | null {
    if (!name) return null;
    const upper = name.toUpperCase().trim();
    if (physicianLookup.has(upper)) return physicianLookup.get(upper)!;
    const parts = upper.split(",").map(s => s.trim());
    if (parts.length >= 2) {
      const key = `${parts[0]}, ${parts[1]}`;
      if (physicianLookup.has(key)) return physicianLookup.get(key)!;
    }
    if (physicianLookup.has(parts[0])) return physicianLookup.get(parts[0])!;
    return null;
  }

  console.log("[Import] Importing claims from revenue data...");
  let claimCount = 0;
  let batchValues: string[] = [];
  const BATCH_SIZE = 200;

  async function flushBatch() {
    if (batchValues.length === 0) return;
    const insertSql = `INSERT INTO claims (claim_number, location_id, physician_id, patient_account_number, dos, 
      payer, payer_type, billed_amount, expected_amount, paid_amount, adjustment_amount, 
      patient_responsibility, status, submission_date, payment_date,
      is_underpaid, underpaid_amount, source)
      VALUES ${batchValues.join(",")}
      ON CONFLICT DO NOTHING`;
    await db.execute(sql.raw(insertSql));
    batchValues = [];
  }

  for (const row of revData) {
    const facility = row["Visit Facility"];
    const locationId = locationMap[facility];
    if (!locationId) continue;

    const claimNum = row["Prompt Claim Number"] || `IMPORT-${row["Patient Account Number"]}-${row["DOS"]}`;
    const dosRaw = row["DOS"];
    if (!dosRaw) continue;
    const dos = typeof dosRaw === "number" ? excelDateToISO(dosRaw) : String(dosRaw);

    const physicianId = findPhysician(row["Referring Provider"]);
    const patientAcct = row["Patient Account Number"] || null;
    const payer = row["Case Primary Insurance"] || null;
    const payerType = mapPayerType(row["Case Primary Payer Reporting Type"]);

    const billed = safeNum(row["Last Billed"]);
    const allowed = safeNum(row["Primary Allowed"]);
    const notAllowed = safeNum(row["Primary Not Allowed"]);
    const totalPaid = safeNum(row["Total Paid"]);
    const patientPaid = safeNum(row["Patient Paid"]);
    const hanging = safeNum(row["Hanging"]);
    const insPosted = safeNum(row["Ins. Posted"]);
    const insNotPosted = safeNum(row["Ins. Not Posted"]);

    const status = mapStatus(row["Visit Stage"], totalPaid, hanging);
    const isUnderpaid = hanging > 5;
    const underpaidAmt = isUnderpaid ? hanging : 0;

    const lastRemitRaw = row["Last Remit Date"];
    const paymentDate = lastRemitRaw && typeof lastRemitRaw === "number" ? excelDateToISO(lastRemitRaw) : null;

    const esc = (v: any) => {
      if (v === null || v === undefined) return "NULL";
      return `'${String(v).replace(/'/g, "''")}'`;
    };

    batchValues.push(`(${esc(claimNum)}, ${esc(locationId)}, ${esc(physicianId)}, ${esc(patientAcct)}, ${esc(dos)},
      ${esc(payer)}, ${esc(payerType)}, ${billed.toFixed(2)}, ${allowed.toFixed(2)}, ${totalPaid.toFixed(2)}, ${notAllowed.toFixed(2)},
      ${patientPaid.toFixed(2)}, ${esc(status)}, ${paymentDate ? esc(dos) : esc(dos)}, ${paymentDate ? esc(paymentDate) : "NULL"},
      ${isUnderpaid}, ${underpaidAmt > 0 ? underpaidAmt.toFixed(2) : "NULL"}, 'prompt-import')`);

    claimCount++;

    if (batchValues.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }
  await flushBatch();
  console.log(`[Import] Imported ${claimCount} claims`);

  console.log("[Import] Computing clinic financials from real data...");
  await db.execute(sql`
    INSERT INTO clinic_financials (location_id, period_date, period_type, gross_revenue, total_visits, total_units, 
      labor_cost, rent_cost, supplies_cost, other_fixed_costs, net_contribution, source)
    SELECT 
      location_id,
      date_trunc('week', dos::date)::date as period_date,
      'WEEKLY' as period_type,
      COALESCE(SUM(paid_amount::numeric), 0) as gross_revenue,
      COUNT(*) as total_visits,
      COUNT(*) * 6 as total_units,
      COALESCE(SUM(paid_amount::numeric), 0) * 0.40 as labor_cost,
      CASE 
        WHEN COUNT(*) > 60 THEN 1400
        WHEN COUNT(*) > 40 THEN 1050
        ELSE 750
      END as rent_cost,
      CASE 
        WHEN COUNT(*) > 60 THEN 420
        WHEN COUNT(*) > 40 THEN 280
        ELSE 185
      END as supplies_cost,
      250 as other_fixed_costs,
      COALESCE(SUM(paid_amount::numeric), 0) * 0.60 - 
        CASE WHEN COUNT(*) > 60 THEN 2070 WHEN COUNT(*) > 40 THEN 1580 ELSE 1185 END as net_contribution,
      'prompt-import' as source
    FROM claims
    WHERE source = 'prompt-import'
    GROUP BY location_id, date_trunc('week', dos::date)
    ON CONFLICT (location_id, period_date, period_type) DO UPDATE SET
      gross_revenue = EXCLUDED.gross_revenue,
      total_visits = EXCLUDED.total_visits,
      net_contribution = EXCLUDED.net_contribution
  `);

  const finCount = await db.execute(sql`SELECT count(*) as cnt FROM clinic_financials WHERE source = 'prompt-import'`);
  console.log(`[Import] Created ${finCount.rows[0].cnt} clinic financial records`);

  console.log("[Import] Building revenue summary from real Prompt data...");
  const revSummarySheet = revWb.Sheets["Summary"];
  if (revSummarySheet) {
    const summaryData: any[] = XLSX.utils.sheet_to_json(revSummarySheet);
    for (const row of summaryData) {
      const payerName = row["Primary Payer"];
      if (!payerName) continue;
      const totalBilled = safeNum(row["Total Billed"]);
      const totalPaid = safeNum(row["Total Paid"]);
      const visits = safeNum(row["Total Visits"]);
      if (visits > 0 && totalBilled > 0) {
        const avgRate = totalPaid / visits;
        await db.execute(sql`
          INSERT INTO payer_rate_schedule (payer, payer_type, cpt_code, expected_rate, effective_date, source)
          VALUES (${payerName}, ${mapPayerType(payerName)}, '97110', ${avgRate.toFixed(2)}, '2026-01-01', 'prompt-import')
          ON CONFLICT DO NOTHING
        `);
      }
    }
    console.log(`[Import] Added payer rate benchmarks from ${summaryData.length} payers`);
  }

  console.log("[Import] Real financial data import complete!");
}
