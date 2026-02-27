/**
 * Appeal CRUD, generation, status transitions, and outcome stats.
 * Template CRUD and seeding live in storage-appeal-templates.ts.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { appeals } from "@shared/schema";
import type { Appeal, InsertAppeal } from "@shared/schema";
import {
  getAppealTemplates,
  getAppealTemplate,
  matchTemplateForDenialCodes,
  renderAppealText,
} from "./storage-appeal-templates";

// Re-export template + stats functions so routes only need one import
export {
  getAppealTemplates,
  getAppealTemplate,
  upsertAppealTemplate,
  deleteAppealTemplate,
  seedDefaultAppealTemplates,
  getAppealStats,
} from "./storage-appeal-templates";
export type { AppealStats } from "./storage-appeal-templates";

// ---- Appeal Generation ----

/**
 * Generates an appeal letter for a claim by merging claim data into a template.
 * If templateId is omitted, auto-selects template by denial codes on the claim.
 */
export async function generateAppeal(
  claimId: string,
  templateId?: string,
  createdBy?: string,
): Promise<Appeal> {
  const claimResult = await db.execute(sql`
    SELECT c.*, l.name AS location_name, l.address AS location_address,
           u.name AS provider_name
    FROM claims c
    LEFT JOIN locations l ON l.id = c.location_id
    LEFT JOIN users u ON u.id = c.provider_id
    WHERE c.id = ${claimId}
    LIMIT 1
  `);
  const claim = (claimResult.rows as any[])[0];
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  let template = templateId
    ? (await getAppealTemplate(templateId)) ?? null
    : null;

  if (!template) {
    if (templateId) throw new Error(`Template ${templateId} not found`);
    const allTemplates = await getAppealTemplates(true);
    const denialCodes = claim.denial_codes
      ? String(claim.denial_codes).split(",").map((c: string) => c.trim())
      : [];
    template = matchTemplateForDenialCodes(denialCodes, allTemplates);
    if (!template) throw new Error("No appeal template found. Run seed first.");
  }

  const billedAmt = parseFloat(claim.billed_amount) || 0;
  const paidAmt = parseFloat(claim.paid_amount) || 0;
  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
  });
  const dosFormatted = claim.dos
    ? new Date(claim.dos).toLocaleDateString("en-US", {
        month: "2-digit", day: "2-digit", year: "numeric",
      })
    : "";

  const placeholders: Record<string, string> = {
    claimNumber: claim.claim_number ?? "",
    patientName: claim.patient_name ?? "",
    patientAccountNumber: claim.patient_account_number ?? "",
    dateOfService: dosFormatted,
    payer: claim.payer ?? "",
    cptCodes: claim.cpt_codes ?? "",
    billedAmount: `$${billedAmt.toFixed(2)}`,
    paidAmount: `$${paidAmt.toFixed(2)}`,
    denialCodes: claim.denial_codes ?? "",
    denialReasons: claim.denial_reason ?? "",
    providerName: claim.provider_name ?? "",
    clinicName: claim.location_name ?? "",
    clinicAddress: claim.location_address ?? "",
    currentDate: today,
    variance: `$${(billedAmt - paidAmt).toFixed(2)}`,
  };

  const generatedText = renderAppealText(template.templateText, placeholders);

  const insertData = {
    claimId,
    templateId: template.id,
    generatedText,
    status: "DRAFTED",
    createdBy: createdBy ?? null,
  } as unknown as InsertAppeal;

  const [appeal] = await db.insert(appeals).values(insertData).returning();
  return appeal;
}

// ---- Appeals CRUD ----

export async function getAppeals(filters: {
  claimId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: Appeal[]; total: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions: ReturnType<typeof sql>[] = [];
  if (filters.claimId) conditions.push(sql`a.claim_id = ${filters.claimId}`);
  if (filters.status) conditions.push(sql`a.status = ${filters.status}`);
  const where = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const [countResult, dataResult] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS total FROM appeals a ${where}`),
    db.execute(sql`
      SELECT a.*, c.claim_number, c.patient_name, c.payer, c.dos
      FROM appeals a
      JOIN claims c ON c.id = a.claim_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
  ]);

  return {
    data: dataResult.rows as any[],
    total: Number((countResult.rows[0] as any)?.total) || 0,
  };
}

export async function getAppeal(id: string): Promise<Appeal | undefined> {
  const result = await db.execute(sql`
    SELECT a.*, c.claim_number, c.patient_name, c.payer, c.dos,
           t.name AS template_name
    FROM appeals a
    JOIN claims c ON c.id = a.claim_id
    LEFT JOIN appeal_templates t ON t.id = a.template_id
    WHERE a.id = ${id}
    LIMIT 1
  `);
  return result.rows[0] as Appeal | undefined;
}

export async function updateAppealStatus(
  id: string,
  status: string,
  notes?: string,
  recoveredAmount?: string,
): Promise<Appeal> {
  const setClauses: ReturnType<typeof sql>[] = [
    sql`status = ${status}`,
    sql`updated_at = NOW()`,
  ];
  if (notes !== undefined) setClauses.push(sql`notes = ${notes}`);
  if (recoveredAmount !== undefined) setClauses.push(sql`recovered_amount = ${recoveredAmount}`);
  if (status === "SUBMITTED") setClauses.push(sql`submitted_date = CURRENT_DATE`);
  if (["WON", "LOST", "EXPIRED"].includes(status)) setClauses.push(sql`outcome_date = CURRENT_DATE`);

  const result = await db.execute(sql`
    UPDATE appeals SET ${sql.join(setClauses, sql`, `)}
    WHERE id = ${id}
    RETURNING *
  `);
  const row = result.rows[0] as Appeal | undefined;
  if (!row) throw new Error(`Appeal ${id} not found`);
  return row;
}

