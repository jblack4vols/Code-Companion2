import { db } from "./db";
import { sql } from "drizzle-orm";

const locations = [
  { id: "f4ceb9df-1228-4c2c-8508-958674738afd", name: "Bean Station", size: "small" },
  { id: "36ec3065-2f3f-45bb-9203-07bd3faa7e55", name: "Jefferson City", size: "medium" },
  { id: "78a2e363-51b3-43dd-a8a6-8f69e3c8a7ff", name: "Johnson City", size: "large" },
  { id: "820211c8-2e38-4a57-b56a-e8f00c9340e2", name: "Maryville", size: "medium" },
  { id: "0f4114c0-a96e-4aad-9ab8-d39a8ce77863", name: "Morristown", size: "large" },
  { id: "6da09fb0-68c3-4474-9100-c42faf5511a0", name: "New Tazewell", size: "small" },
  { id: "06f764ba-7752-4161-bd24-ec2eefff256e", name: "Newport", size: "small" },
  { id: "d06e8d70-deed-4bfd-a909-9ec7665a34ea", name: "Rogersville", size: "medium" },
];

const sizeConfig: Record<string, { weeklyVisits: [number, number]; revenuePerVisit: [number, number]; laborPct: number; rentMonthly: number; suppliesMonthly: number }> = {
  small:  { weeklyVisits: [35, 55],  revenuePerVisit: [110, 145], laborPct: 0.42, rentMonthly: 3200, suppliesMonthly: 800 },
  medium: { weeklyVisits: [55, 85],  revenuePerVisit: [115, 150], laborPct: 0.40, rentMonthly: 4500, suppliesMonthly: 1200 },
  large:  { weeklyVisits: [85, 130], revenuePerVisit: [120, 155], laborPct: 0.38, rentMonthly: 6000, suppliesMonthly: 1800 },
};

const payers = [
  { name: "BlueCross BlueShield of TN", type: "Commercial", weight: 0.30 },
  { name: "United Healthcare", type: "Commercial", weight: 0.18 },
  { name: "Aetna", type: "Commercial", weight: 0.10 },
  { name: "Cigna", type: "Commercial", weight: 0.08 },
  { name: "Humana", type: "Commercial", weight: 0.06 },
  { name: "Medicare Part B", type: "Medicare", weight: 0.15 },
  { name: "TennCare (Medicaid)", type: "Medicaid", weight: 0.08 },
  { name: "Workers Comp - Various", type: "Workers Comp", weight: 0.05 },
];

const cptCodes = [
  { code: "97110", desc: "Therapeutic Exercise", units: [2, 4], rate: [32, 42] },
  { code: "97140", desc: "Manual Therapy", units: [1, 3], rate: [34, 44] },
  { code: "97530", desc: "Therapeutic Activities", units: [1, 3], rate: [30, 40] },
  { code: "97112", desc: "Neuromuscular Re-ed", units: [1, 2], rate: [33, 43] },
  { code: "97161", desc: "PT Eval Low", units: [1, 1], rate: [85, 110] },
  { code: "97162", desc: "PT Eval Moderate", units: [1, 1], rate: [110, 140] },
  { code: "97163", desc: "PT Eval High", units: [1, 1], rate: [130, 165] },
  { code: "97035", desc: "Ultrasound", units: [1, 1], rate: [18, 28] },
  { code: "97010", desc: "Hot/Cold Packs", units: [1, 1], rate: [8, 15] },
];

const denialCodes = [
  { code: "CO-4", reason: "Procedure code inconsistent with modifier or missing modifier", freq: 0.25 },
  { code: "CO-16", reason: "Claim lacks information needed for adjudication", freq: 0.20 },
  { code: "CO-97", reason: "Payment adjusted - already adjudicated", freq: 0.15 },
  { code: "CO-18", reason: "Duplicate claim/service", freq: 0.12 },
  { code: "PR-1", reason: "Deductible amount", freq: 0.10 },
  { code: "CO-29", reason: "Time limit for filing has expired", freq: 0.08 },
  { code: "CO-50", reason: "Non-covered service", freq: 0.05 },
  { code: "OA-23", reason: "Authorization required", freq: 0.05 },
];

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const r = Math.random();
  let cum = 0;
  for (const item of items) {
    cum += item.weight;
    if (r <= cum) return item;
  }
  return items[items.length - 1];
}

function pickDenial(): { code: string; reason: string } {
  return pickWeighted(denialCodes.map(d => ({ ...d, weight: d.freq })));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonday(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = r.getDate() - day + (day === 0 ? -6 : 1);
  r.setDate(diff);
  return r;
}

export async function seedFinancialData() {
  const existing = await db.execute(sql`SELECT count(*) as cnt FROM claims`);
  if (Number(existing.rows[0].cnt) > 10) {
    console.log("[Financials] Already seeded, skipping...");
    return;
  }

  console.log("[Financials] Generating realistic financial data...");

  const startDate = new Date("2025-10-01");
  const endDate = new Date("2026-03-25");

  const physicianRows = await db.execute(sql`SELECT id FROM physicians ORDER BY random() LIMIT 200`);
  const physicianIds = physicianRows.rows.map((r: any) => r.id);

  let claimCount = 0;
  let paymentCount = 0;
  let clinicFinCount = 0;

  for (const loc of locations) {
    const cfg = sizeConfig[loc.size];
    const current = new Date(startDate);

    while (current <= endDate) {
      const weekStart = getMonday(new Date(current));
      const visitsThisWeek = rand(cfg.weeklyVisits[0], cfg.weeklyVisits[1]);
      let weekRevenue = 0;

      for (let v = 0; v < visitsThisWeek; v++) {
        const visitDay = addDays(weekStart, rand(0, 4));
        if (visitDay > endDate || visitDay < startDate) continue;

        const payer = pickWeighted(payers);
        const numCpts = rand(2, 5);
        const selectedCpts: typeof cptCodes[number][] = [];
        const cptPool = [...cptCodes];
        for (let c = 0; c < numCpts && cptPool.length > 0; c++) {
          const idx = rand(0, cptPool.length - 1);
          selectedCpts.push(cptPool[idx]);
          cptPool.splice(idx, 1);
        }

        const cptCodeStr = selectedCpts.map(c => c.code).join(",");
        const totalUnits = selectedCpts.reduce((s, c) => s + rand(c.units[0], c.units[1]), 0);

        let payerMultiplier = 1.0;
        if (payer.type === "Medicare") payerMultiplier = 0.80;
        if (payer.type === "Medicaid") payerMultiplier = 0.65;
        if (payer.type === "Workers Comp") payerMultiplier = 1.15;

        const billedAmount = selectedCpts.reduce((s, c) => {
          const u = rand(c.units[0], c.units[1]);
          return s + u * randFloat(c.rate[0], c.rate[1]);
        }, 0);
        const expectedAmount = billedAmount * payerMultiplier * randFloat(0.85, 0.95);
        const locCode = loc.id.substring(0, 6).toUpperCase();
        const claimNum = `TS${locCode}${formatDate(visitDay).replace(/-/g, "")}${String(v).padStart(3, "0")}`;

        const submissionDate = addDays(visitDay, rand(1, 5));

        const r = Math.random();
        let status: string;
        let paidAmount = 0;
        let adjustmentAmount = 0;
        let paymentDate: Date | null = null;
        let denialCode: string | null = null;
        let denialReason: string | null = null;
        let isUnderpaid = false;
        let underpaidAmt = 0;

        if (r < 0.65) {
          status = "PAID";
          paidAmount = Math.min(expectedAmount * randFloat(0.92, 1.02), billedAmount);
          adjustmentAmount = Math.max(billedAmount - paidAmount, 0);
          paymentDate = addDays(submissionDate, rand(14, 45));
          if (paidAmount < expectedAmount * 0.90) {
            isUnderpaid = true;
            underpaidAmt = expectedAmount - paidAmount;
          }
        } else if (r < 0.80) {
          status = "PARTIAL";
          paidAmount = expectedAmount * randFloat(0.40, 0.75);
          adjustmentAmount = Math.max(billedAmount - paidAmount, 0);
          paymentDate = addDays(submissionDate, rand(14, 45));
          isUnderpaid = true;
          underpaidAmt = expectedAmount - paidAmount;
        } else if (r < 0.90) {
          status = "DENIED";
          const denial = pickDenial();
          denialCode = denial.code;
          denialReason = denial.reason;
        } else if (r < 0.95) {
          status = "SUBMITTED";
        } else {
          status = "APPEALED";
          const denial = pickDenial();
          denialCode = denial.code;
          denialReason = denial.reason;
          paidAmount = 0;
        }

        const physicianId = physicianIds.length > 0 ? physicianIds[rand(0, physicianIds.length - 1)] : null;

        await db.execute(sql`
          INSERT INTO claims (claim_number, location_id, physician_id, dos, cpt_codes, units,
            payer, payer_type, billed_amount, expected_amount, paid_amount, adjustment_amount,
            status, submission_date, payment_date, denial_codes, denial_reason,
            is_underpaid, underpaid_amount, source)
          VALUES (
            ${claimNum}, ${loc.id}, ${physicianId}, ${formatDate(visitDay)}, ${cptCodeStr}, ${totalUnits},
            ${payer.name}, ${payer.type}, ${billedAmount.toFixed(2)}, ${expectedAmount.toFixed(2)},
            ${paidAmount.toFixed(2)}, ${adjustmentAmount.toFixed(2)},
            ${status}, ${formatDate(submissionDate)}, ${paymentDate ? formatDate(paymentDate) : null},
            ${denialCode}, ${denialReason}, ${isUnderpaid}, ${underpaidAmt > 0 ? underpaidAmt.toFixed(2) : null},
            'seed'
          )
        `);

        if (status === "PAID" || status === "PARTIAL") weekRevenue += paidAmount;

        claimCount++;
      }

      const monthlyRent = cfg.rentMonthly / 4.33;
      const monthlySupplies = cfg.suppliesMonthly / 4.33;
      const laborCost = weekRevenue * cfg.laborPct * randFloat(0.90, 1.10);
      const netContribution = weekRevenue - laborCost - monthlyRent - monthlySupplies;

      await db.execute(sql`
        INSERT INTO clinic_financials (location_id, period_date, period_type, gross_revenue,
          total_visits, total_units, labor_cost, rent_cost, supplies_cost, other_fixed_costs,
          net_contribution, source)
        VALUES (
          ${loc.id}, ${formatDate(weekStart)}, 'WEEKLY', ${weekRevenue.toFixed(2)},
          ${visitsThisWeek}, ${visitsThisWeek * rand(5, 9)},
          ${laborCost.toFixed(2)}, ${monthlyRent.toFixed(2)}, ${monthlySupplies.toFixed(2)},
          ${randFloat(100, 400).toFixed(2)}, ${netContribution.toFixed(2)}, 'seed'
        )
        ON CONFLICT (location_id, period_date, period_type) DO NOTHING
      `);
      clinicFinCount++;

      current.setDate(current.getDate() + 7);
    }
  }

  const rateInserts: string[] = [];
  for (const payer of payers) {
    for (const cpt of cptCodes) {
      const rate = randFloat(cpt.rate[0], cpt.rate[1]) * (payer.type === "Medicare" ? 0.80 : payer.type === "Medicaid" ? 0.65 : 1.0);
      await db.execute(sql`
        INSERT INTO payer_rate_schedule (payer, payer_type, cpt_code, expected_rate, effective_date, source)
        VALUES (${payer.name}, ${payer.type}, ${cpt.code}, ${rate.toFixed(2)}, '2025-10-01', 'seed')
        ON CONFLICT DO NOTHING
      `);
    }
  }

  const appealableClaims = await db.execute(sql`
    SELECT id, billed_amount, expected_amount FROM claims
    WHERE status = 'DENIED' AND denial_codes IS NOT NULL
    ORDER BY random() LIMIT 40
  `);

  for (const claim of appealableClaims.rows as any[]) {
    const r = Math.random();
    let status: string;
    let recoveredAmount: number | null = null;
    let submittedDate: string | null = formatDate(addDays(new Date(), -rand(10, 60)));
    let outcomeDate: string | null = null;

    if (r < 0.35) {
      status = "WON";
      recoveredAmount = Number(claim.expected_amount) * randFloat(0.70, 1.0);
      outcomeDate = formatDate(addDays(new Date(submittedDate), rand(14, 45)));
    } else if (r < 0.55) {
      status = "LOST";
      outcomeDate = formatDate(addDays(new Date(submittedDate), rand(14, 45)));
    } else if (r < 0.80) {
      status = "SUBMITTED";
    } else {
      status = "DRAFTED";
      submittedDate = null;
    }

    await db.execute(sql`
      INSERT INTO appeals (claim_id, generated_text, status, submitted_date, outcome_date, recovered_amount)
      VALUES (
        ${claim.id},
        ${"Appeal for denied claim. Original billed amount: $" + Number(claim.billed_amount).toFixed(2) + ". Requesting reconsideration based on medical necessity documentation and correct coding guidelines."},
        ${status}, ${submittedDate}, ${outcomeDate},
        ${recoveredAmount ? recoveredAmount.toFixed(2) : null}
      )
    `);
  }

  await db.execute(sql`
    UPDATE claims SET status = 'APPEALED'
    WHERE id IN (SELECT claim_id FROM appeals WHERE status IN ('SUBMITTED', 'WON', 'LOST'))
    AND status = 'DENIED'
  `);

  console.log(`[Financials] Seeded ${claimCount} claims, ${clinicFinCount} clinic financial records, ${appealableClaims.rows.length} appeals, and payer rate schedules.`);
  console.log("[Financials] Done!");
}
