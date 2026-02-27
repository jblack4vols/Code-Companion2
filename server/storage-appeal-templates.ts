/**
 * Appeal template CRUD, default seeding, and denial-code matching logic.
 * Companion to storage-appeals.ts.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { appealTemplates } from "@shared/schema";
import type { AppealTemplate, InsertAppealTemplate } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

// ---- Placeholder Renderer (shared utility) ----

export function renderAppealText(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => data[key] ?? `{{${key}}}`);
}

// ---- Template Matching ----

/**
 * Finds best matching template for a set of denial codes.
 * Prefers specific matches (non-null denialCodePattern) over generic (null pattern).
 * Among specific matches, prefers shortest pattern (most targeted).
 */
export function matchTemplateForDenialCodes(
  denialCodes: string[],
  templates: AppealTemplate[],
): AppealTemplate | null {
  const active = templates.filter((t) => t.isActive);
  const specific: AppealTemplate[] = [];

  for (const tmpl of active) {
    if (!tmpl.denialCodePattern) continue;
    const patternCodes = tmpl.denialCodePattern.split(",").map((c) => c.trim().toUpperCase());
    if (denialCodes.some((dc) => patternCodes.includes(dc.toUpperCase()))) {
      specific.push(tmpl);
    }
  }

  if (specific.length > 0) {
    return specific.sort(
      (a, b) =>
        (a.denialCodePattern?.split(",").length ?? 0) -
        (b.denialCodePattern?.split(",").length ?? 0),
    )[0];
  }

  return active.find((t) => !t.denialCodePattern) ?? null;
}

// ---- CRUD ----

export async function getAppealTemplates(activeOnly = false): Promise<AppealTemplate[]> {
  const where = activeOnly ? eq(appealTemplates.isActive, true) : undefined;
  return db.select().from(appealTemplates).where(where).orderBy(desc(appealTemplates.createdAt));
}

export async function getAppealTemplate(id: string): Promise<AppealTemplate | undefined> {
  const [row] = await db.select().from(appealTemplates).where(eq(appealTemplates.id, id));
  return row;
}

export async function upsertAppealTemplate(data: InsertAppealTemplate & { id?: string }): Promise<AppealTemplate> {
  if (data.id) {
    const { id, ...rest } = data;
    const [row] = await db
      .update(appealTemplates)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(appealTemplates.id, id))
      .returning();
    return row;
  }
  const [row] = await db.insert(appealTemplates).values(data).returning();
  return row;
}

export async function deleteAppealTemplate(id: string): Promise<void> {
  await db
    .update(appealTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(appealTemplates.id, id));
}

// ---- Seed Defaults ----

// ---- Appeal Outcome Stats ----

export interface AppealStats {
  total: number;
  drafted: number;
  submitted: number;
  won: number;
  lost: number;
  expired: number;
  winRate: number;
  totalRecovered: number;
  avgRecoveryAmount: number;
}

export async function getAppealStats(): Promise<AppealStats> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'DRAFTED')::int AS drafted,
      COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
      COUNT(*) FILTER (WHERE status = 'WON')::int AS won,
      COUNT(*) FILTER (WHERE status = 'LOST')::int AS lost,
      COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS expired,
      COALESCE(SUM(recovered_amount) FILTER (WHERE status = 'WON'), 0)::float AS total_recovered,
      COALESCE(AVG(recovered_amount) FILTER (WHERE status = 'WON'), 0)::float AS avg_recovery
    FROM appeals
  `);
  const r = (result.rows[0] as any) || {};
  const won = Number(r.won) || 0;
  const lost = Number(r.lost) || 0;
  const resolved = won + lost;
  return {
    total: Number(r.total) || 0,
    drafted: Number(r.drafted) || 0,
    submitted: Number(r.submitted) || 0,
    won,
    lost,
    expired: Number(r.expired) || 0,
    winRate: resolved > 0 ? Math.round((won / resolved) * 1000) / 10 : 0,
    totalRecovered: parseFloat(r.total_recovered) || 0,
    avgRecoveryAmount: parseFloat(r.avg_recovery) || 0,
  };
}

/** Seeds 3 starter templates if none exist. Called once on route registration. */
export async function seedDefaultAppealTemplates(): Promise<void> {
  const existing = await db.select({ id: appealTemplates.id }).from(appealTemplates).limit(1);
  if (existing.length > 0) return;

  const defaults: InsertAppealTemplate[] = [
    {
      name: "Medical Necessity Denial (CO-50, CO-55)",
      denialCodePattern: "CO-50,CO-55",
      templateText: `Re: Appeal for Claim {{claimNumber}}\n\nDear Claims Review Department,\n\nI am writing to appeal the denial of claim {{claimNumber}} for patient {{patientName}} (Account #{{patientAccountNumber}}) for services rendered on {{dateOfService}}.\n\nThe claim was denied with reason code(s): {{denialCodes}}\n({{denialReasons}})\n\nThe CPT codes billed ({{cptCodes}}) reflect medically necessary services prescribed by the referring provider.\n\nBilled amount: {{billedAmount}}\nAmount paid: {{paidAmount}}\n\nWe respectfully request a full review of this denial.\n\nSincerely,\n{{clinicName}}\n{{clinicAddress}}\nDate: {{currentDate}}`,
      isActive: true,
    },
    {
      name: "Underpayment Appeal (Generic)",
      denialCodePattern: null,
      templateText: `Re: Underpayment Appeal - Claim {{claimNumber}}\n\nDear Provider Relations,\n\nWe have identified an underpayment on claim {{claimNumber}} for {{patientName}}, date of service {{dateOfService}}.\n\nBilled: {{billedAmount}}\nExpected (per contract): {{variance}} above amount paid\nPaid: {{paidAmount}}\nUnderpayment: {{variance}}\n\nCPT Codes: {{cptCodes}}\nPayer: {{payer}}\n\nPlease review and reprocess this claim per our contracted rates.\n\n{{clinicName}}\n{{currentDate}}`,
      isActive: true,
    },
    {
      name: "Missing Information (CO-16, CO-252)",
      denialCodePattern: "CO-16,CO-252",
      templateText: `Re: Additional Information - Claim {{claimNumber}}\n\nDear Claims Department,\n\nIn response to your request for additional information regarding claim {{claimNumber}} (denial codes: {{denialCodes}}), please find the following:\n\nPatient: {{patientName}} (Account: {{patientAccountNumber}})\nDate of Service: {{dateOfService}}\nServices: {{cptCodes}}\nProvider: {{providerName}}\n\n[ATTACH SUPPORTING DOCUMENTATION HERE]\n\nPlease reprocess this claim at your earliest convenience.\n\n{{clinicName}}\n{{currentDate}}`,
      isActive: true,
    },
  ];

  for (const tmpl of defaults) {
    await db.insert(appealTemplates).values(tmpl);
  }
}
